import { Redis } from "ioredis";
import { getSharedRedisConnection } from "./connection.js";

export interface CoordinateDelayOptions {
  /**
   * The identifier of the sending mailbox/account.
   */
  senderId: string;

  /**
   * Minimum delay required between consecutive email dispatches for this sender (in milliseconds).
   */
  minDelayMs: number;

  /**
   * Current timestamp in milliseconds (defaults to Date.now()).
   * Useful for deterministic testing and clock-synchronized operations.
   */
  now?: number;

  /**
   * Optional custom Redis client instance. Defaults to the shared connection singleton.
   */
  redisClient?: Redis;

  /**
   * Delay coordination scope:
   * - "per-sender": Throttles dispatches per sender address/mailbox (default & recommended).
   * - "global": Throttles dispatches globally across all senders.
   */
  scope?: "per-sender" | "global";
}

export interface CoordinateDelayResult {
  /**
   * Number of milliseconds the worker must wait before sending to satisfy the minimum delay.
   * If 0, the job may be dispatched immediately.
   */
  waitMs: number;

  available: boolean;

  /**
   * The authoritative timestamp (ms) at which this email is permitted to send.
   */
  scheduledSendTime: number;

  /**
   * The Redis key that reserved this send slot.
   */
  reservedKey: string;
}

export const DELAY_COORDINATOR_KEYS = {
  senderKey: (senderId: string) => `email-delay:sender:${senderId}`,
  globalKey: () => "email-delay:global",
} as const;

/**
 * Atomic Lua script to coordinate distributed send delay across all workers.
 *
 * Algorithm:
 * 1. Read stored `nextAvailableTime` for the sender or global key.
 * 2. If no time is stored or `stored <= now`, target send time is `now`.
 * 3. If `stored > now`, target send time is `stored`.
 * 4. Advance `nextAvailableTime` to `targetSendTime + minDelayMs`.
 * 5. Update Redis key with dynamic TTL (buffer of remaining wait + 120s).
 * 6. Return `[waitMs, targetSendTime]`.
 */
export const ATOMIC_RESERVE_DELAY_SCRIPT = `
local key = KEYS[1]
local clientNow = tonumber(ARGV[1])
local minDelayMs = tonumber(ARGV[2])

local now = clientNow
if not now or now <= 0 then
    local time = redis.call('TIME')
    now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
end

local lastScheduledTime = redis.call('GET', key)
local sendTime = now

if lastScheduledTime then
    local lastTime = tonumber(lastScheduledTime)
    if lastTime and lastTime > now then
        sendTime = lastTime
    end
end

local nextAvailableTime = sendTime + minDelayMs
local diffMs = nextAvailableTime - now
local ttlSeconds = math.ceil(diffMs / 1000) + 120
if ttlSeconds < 60 then
    ttlSeconds = 60
end

redis.call('SET', key, tostring(nextAvailableTime), 'EX', ttlSeconds)

local waitMs = sendTime - now
if waitMs < 0 then
    waitMs = 0
end

return { waitMs, tostring(sendTime) }
`;

/**
 * Coordinates minimum send delay across multiple concurrent worker instances using Redis.
 *
 * Architecture & Guarantees:
 * - Atomic coordination: Uses a Redis Lua script to eliminate race conditions between workers.
 * - Per-sender pacing: Preserves multi-tenant concurrency so different senders run in parallel.
 * - FIFO ordering: First-arriving jobs reserve earlier time slots; subsequent jobs are spaced
 *   by exactly minDelayMs.
 * - Graceful degradation: If Redis is unavailable, returns waitMs = 0 with fallback logging.
 */
export async function coordinateSendDelay(
  options: CoordinateDelayOptions,
): Promise<CoordinateDelayResult> {
  const {
    senderId,
    minDelayMs,
    now = Date.now(),
    redisClient,
    scope = "per-sender",
  } = options;

  const targetKey =
    scope === "global"
      ? DELAY_COORDINATOR_KEYS.globalKey()
      : DELAY_COORDINATOR_KEYS.senderKey(senderId);

  // If minDelayMs is non-positive, no pacing required
  if (minDelayMs <= 0) {
    return {
      waitMs: 0,
      available: true,
      scheduledSendTime: now,
      reservedKey: targetKey,
    };
  }

  let redis: Redis;
  try {
    redis = redisClient ?? getSharedRedisConnection();
  } catch {
    // Without Redis, a zero-delay fallback could violate cross-worker pacing.
    return {
      waitMs: minDelayMs,
      available: false,
      scheduledSendTime: now,
      reservedKey: targetKey,
    };
  }

  try {
    const rawResult = (await redis.eval(
      ATOMIC_RESERVE_DELAY_SCRIPT,
      1,
      targetKey,
      now.toString(),
      minDelayMs.toString(),
    )) as [number | string, string];

    const waitMs =
      typeof rawResult[0] === "number"
        ? rawResult[0]
        : parseInt(String(rawResult[0]), 10) || 0;

    const scheduledSendTime = parseInt(rawResult[1], 10) || now;

    return {
      waitMs,
      available: true,
      scheduledSendTime,
      reservedKey: targetKey,
    };
  } catch (error: unknown) {
    // Graceful fallback if Redis is down or disconnected
    if (process.env.NODE_ENV !== "test") {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[DelayCoordinator Warning] Redis delay coordination error: ${msg}. Deferring dispatch.`,
      );
    }

    return {
      waitMs: minDelayMs,
      available: false,
      scheduledSendTime: now,
      reservedKey: targetKey,
    };
  }
}

/**
 * Gets the next available send timestamp for a sender from Redis.
 */
export async function getNextAllowedSendTime(
  senderId: string,
  redisClient?: Redis,
): Promise<number | null> {
  try {
    const redis = redisClient ?? getSharedRedisConnection();
    const key = DELAY_COORDINATOR_KEYS.senderKey(senderId);
    const value = await redis.get(key);
    return value ? parseInt(value, 10) : null;
  } catch {
    return null;
  }
}

/**
 * Resets the send delay slot for a sender (primarily used for test cleanup and admin overrides).
 */
export async function resetSendDelay(
  senderId: string,
  redisClient?: Redis,
): Promise<void> {
  try {
    const redis = redisClient ?? getSharedRedisConnection();
    const key = DELAY_COORDINATOR_KEYS.senderKey(senderId);
    await redis.del(key);
  } catch {
    // Suppress error if Redis is unreachable
  }
}
