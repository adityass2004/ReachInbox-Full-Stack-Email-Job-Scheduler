import { Redis } from "ioredis";
import { getSharedRedisConnection } from "./connection.js";

export interface ConsumeRateLimitOptions {
  /**
   * The identifier of the sending mailbox/account.
   */
  senderId: string;

  /**
   * Maximum allowed emails per hour for this sender.
   */
  limit: number;

  /**
   * Current timestamp in milliseconds (defaults to Date.now()).
   */
  now?: number;

  /**
   * Optional custom Redis client instance. Defaults to the shared connection singleton.
   */
  redisClient?: Redis;
}

export interface RateLimitResult {
  /**
   * Whether this send is allowed within the current hourly window.
   */
  allowed: boolean;

  storageAvailable: boolean;

  /**
   * Current send count recorded for this sender in the current hour window (after increment if allowed).
   */
  currentUsage: number;

  /**
   * Configured hourly limit.
   */
  limit: number;

  /**
   * Number of remaining emails permitted in the current hour window.
   */
  remaining: number;

  /**
   * Start timestamp of the next hourly window.
   */
  nextWindowStart: Date;

  /**
   * Milliseconds until the next hourly window opens.
   */
  delayUntilNextWindowMs: number;

  /**
   * The hour window identifier (e.g. "2026-10-01-14").
   */
  hourWindow: string;

  /**
   * The Redis key tracking this rate limit.
   */
  key: string;
}

export const RATE_LIMIT_KEYS = {
  senderHourKey: (senderId: string, hourWindow: string) =>
    `email-rate:${senderId}:${hourWindow}`,
} as const;

/**
 * Generates a standard UTC hour window string formatted as YYYY-MM-DD-HH.
 * Example: 2026-10-01-14 (representing 14:00:00 to 14:59:59.999 UTC).
 */
export function getHourWindowString(
  timestamp: number | Date = Date.now(),
): string {
  const d = typeof timestamp === "number" ? new Date(timestamp) : timestamp;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}-${hh}`;
}

/**
 * Calculates the exact start time of the next UTC hourly window.
 * Example: if now is 14:25:30.123 UTC, returns 15:00:00.000 UTC.
 */
export function getNextHourlyWindowStart(
  timestamp: number | Date = Date.now(),
): Date {
  const d =
    typeof timestamp === "number"
      ? new Date(timestamp)
      : new Date(timestamp.getTime());
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d;
}

/**
 * Lua script for atomic hourly rate limit verification and token consumption.
 *
 * Algorithm:
 * 1. Read stored counter for email-rate:{senderId}:{hourWindow}.
 * 2. If count >= limit, return [0, count] (rejected without incrementing).
 * 3. Else, increment counter. If first hit (newCount == 1), set TTL to 7200 seconds (2 hours).
 * 4. Return [1, newCount] (allowed).
 */
export const ATOMIC_CONSUME_RATE_LIMIT_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttlSeconds = tonumber(ARGV[2])

local current = redis.call('GET', key)
local count = 0
if current then
    count = tonumber(current)
end

if count >= limit then
    return { 0, count }
else
    local newCount = redis.call('INCR', key)
    if newCount == 1 then
        redis.call('EXPIRE', key, ttlSeconds)
    end
    return { 1, newCount }
end
`;

const ATOMIC_DECREMENT_RATE_LIMIT_SCRIPT = `
    local key = KEYS[1]
    local current = tonumber(redis.call('GET', key) or '0')
    if current > 0 then
      return redis.call('DECR', key)
    end
    return 0
    `;

/**
 * Atomically checks and consumes a send quota from the sender's current hourly window.
 *
 * Guarantees:
 * - Thread & Process Safe: Uses Redis Lua atomic script; safe across multiple workers and instances.
 * - No in-memory state: State lives strictly in Redis key email-rate:{senderId}:{hourWindow}.
 * - Fail-closed fallback: If Redis is unavailable, the worker defers dispatch rather than bypassing the limit.
 */
export async function consumeHourlyRateLimit(
  options: ConsumeRateLimitOptions,
): Promise<RateLimitResult> {
  const { senderId, limit, now = Date.now(), redisClient } = options;
  const hourWindow = getHourWindowString(now);
  const targetKey = RATE_LIMIT_KEYS.senderHourKey(senderId, hourWindow);
  const nextWindowStart = getNextHourlyWindowStart(now);
  const delayUntilNextWindowMs = Math.max(
    1000,
    nextWindowStart.getTime() - now,
  );

  // If limit is non-positive or unbounded, allow immediately
  if (limit <= 0) {
    return {
      allowed: true,
      storageAvailable: true,
      currentUsage: 0,
      limit,
      remaining: Infinity,
      nextWindowStart,
      delayUntilNextWindowMs,
      hourWindow,
      key: targetKey,
    };
  }

  let redis: Redis;
  try {
    redis = redisClient ?? getSharedRedisConnection();
  } catch {
    // Without shared state, sending could exceed the configured distributed limit.
    return {
      allowed: false,
      storageAvailable: false,
      currentUsage: 0,
      limit,
      remaining: 0,
      nextWindowStart,
      delayUntilNextWindowMs,
      hourWindow,
      key: targetKey,
    };
  }

  try {
    const TTL_SECONDS = 7200; // 2 hours retention for window counter
    const rawResult = (await redis.eval(
      ATOMIC_CONSUME_RATE_LIMIT_SCRIPT,
      1,
      targetKey,
      limit.toString(),
      TTL_SECONDS.toString(),
    )) as [number | string, number | string];

    const isAllowed =
      (typeof rawResult[0] === "number"
        ? rawResult[0]
        : parseInt(String(rawResult[0]), 10)) === 1;
    const currentUsage =
      typeof rawResult[1] === "number"
        ? rawResult[1]
        : parseInt(String(rawResult[1]), 10) || 0;
    const remaining = Math.max(0, limit - currentUsage);

    return {
      allowed: isAllowed,
      storageAvailable: true,
      currentUsage,
      limit,
      remaining,
      nextWindowStart,
      delayUntilNextWindowMs,
      hourWindow,
      key: targetKey,
    };
  } catch (error: unknown) {
    if (process.env.NODE_ENV !== "test") {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[RateLimiter Warning] Redis rate limit check error: ${msg}. Deferring dispatch.`,
      );
    }

    return {
      allowed: false,
      storageAvailable: false,
      currentUsage: 0,
      limit,
      remaining: limit,
      nextWindowStart,
      delayUntilNextWindowMs,
      hourWindow,
      key: targetKey,
    };
  }
}

/**
 * Decrements the hourly rate limit counter without allowing concurrent rollbacks below zero.
 */
export async function decrementHourlyRateLimit(
  senderId: string,
  hourWindow: string = getHourWindowString(),
  redisClient?: Redis,
): Promise<void> {
  try {
    const redis = redisClient ?? getSharedRedisConnection();
    const key = RATE_LIMIT_KEYS.senderHourKey(senderId, hourWindow);
    await redis.eval(ATOMIC_DECREMENT_RATE_LIMIT_SCRIPT, 1, key);
  } catch {
    if (process.env.NODE_ENV !== "test") {
      console.warn(`[RateLimiter Warning] Failed to restore quota for sender ${senderId}.`);
    }
  }
}

/**
 * Returns current hourly usage count for a sender.
 */
export async function getCurrentHourUsage(
  senderId: string,
  hourWindow: string = getHourWindowString(),
  redisClient?: Redis,
): Promise<number> {
  try {
    const redis = redisClient ?? getSharedRedisConnection();
    const key = RATE_LIMIT_KEYS.senderHourKey(senderId, hourWindow);
    const value = await redis.get(key);
    return value ? parseInt(value, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Resets the rate limit counter for a sender (used for test setup and admin resets).
 */
export async function resetHourlyRateLimit(
  senderId: string,
  hourWindow: string = getHourWindowString(),
  redisClient?: Redis,
): Promise<void> {
  try {
    const redis = redisClient ?? getSharedRedisConnection();
    const key = RATE_LIMIT_KEYS.senderHourKey(senderId, hourWindow);
    await redis.del(key);
  } catch {
    // Suppress error
  }
}
