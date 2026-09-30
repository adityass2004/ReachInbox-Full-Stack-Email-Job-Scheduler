import { Redis, RedisOptions } from "ioredis";
import { getRedisConnectionOptions } from "./config.js";

let sharedRedis: Redis | null = null;

/**
 * Creates an independent Redis client instance configured for BullMQ.
 * Attaches a passive error handler to prevent unhandled EventEmitter errors
 * when Redis is disconnected or during connection attempts.
 */
export function createRedisConnection(
  overrides: Partial<RedisOptions> = {},
): Redis {
  const options = getRedisConnectionOptions();
  const client = new Redis({
    ...(options as RedisOptions),
    ...overrides,
  });

  // Prevent uncaught error event crash if Redis connection drops
  client.on("error", (err) => {
    // Only log in dev or debug if desired, prevents Unhandled error event crash
    if (process.env.DEBUG_REDIS === "true") {
      console.warn("[Redis Warning]:", err.message);
    }
  });

  return client;
}

/**
 * Gets or initializes the shared Redis client singleton.
 */
export function getSharedRedisConnection(): Redis {
  if (!sharedRedis) {
    sharedRedis = createRedisConnection();
  }
  return sharedRedis;
}

/**
 * Verifies Redis connectivity with a ping command and latency check.
 * Configured with a fast timeout and no retry loop so health probes return promptly.
 */
export async function checkRedisHealth(timeoutMs = 2000): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  const client = createRedisConnection({
    lazyConnect: true,
    connectTimeout: timeoutMs,
    retryStrategy: () => null, // Do not reconnect on failure during health check
  });

  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Redis connection timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);

    const pingResult = await client.ping();
    const latencyMs = Date.now() - start;
    await client.quit();

    return {
      connected: pingResult === "PONG",
      latencyMs,
    };
  } catch (err: unknown) {
    try {
      client.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown Redis error",
    };
  }
}

/**
 * Gracefully disconnects the shared Redis connection if open.
 */
export async function closeSharedRedisConnection(): Promise<void> {
  if (sharedRedis) {
    try {
      await sharedRedis.quit();
    } catch {
      sharedRedis.disconnect();
    } finally {
      sharedRedis = null;
    }
  }
}
