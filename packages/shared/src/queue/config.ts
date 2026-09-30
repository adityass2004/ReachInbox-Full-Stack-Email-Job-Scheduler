import { ConnectionOptions, JobsOptions } from "bullmq";
import { QUEUE_NAMES, JOB_NAMES } from "../constants/index.js";

export { QUEUE_NAMES, JOB_NAMES };

/**
 * Standard retry, backoff, and retention policy for BullMQ email jobs.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  // Retry transient failures up to 3 times with exponential backoff
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000, // 5s, 10s, 20s
  },
  // Keep completed jobs for 24 hours (or up to 1000 jobs) for Bull Board visibility & audit
  removeOnComplete: {
    age: 24 * 3600,
    count: 1000,
  },
  // Keep failed jobs for 7 days (or up to 5000 jobs) for diagnostic inspection
  removeOnFail: {
    age: 7 * 24 * 3600,
    count: 5000,
  },
};

/**
 * Parses and returns Redis connection options compatible with BullMQ.
 * Ready for both local Docker and managed Redis (Upstash, Memorystore, ElastiCache)
 * with TLS, authentication, and custom host/port/password via environment variables.
 */
export function getRedisConnectionOptions(): ConnectionOptions {
  let redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  redisUrl = redisUrl.replace(/^["']|["']$/g, "");
  const isTlsExplicit = process.env.REDIS_TLS === "true";

  let options: ConnectionOptions;

  try {
    const parsed = new URL(redisUrl);
    const isRediss = parsed.protocol === "rediss:";

    options = {
      host: parsed.hostname || "localhost",
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      username: parsed.username || undefined,
      password: parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined,
      db:
        parsed.pathname && parsed.pathname.length > 1
          ? parseInt(parsed.pathname.slice(1), 10)
          : 0,
      tls:
        isRediss || isTlsExplicit ? { rejectUnauthorized: true } : undefined,
    };
  } catch {
    options = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password: process.env.REDIS_PASSWORD || undefined,
      tls: isTlsExplicit ? { rejectUnauthorized: true } : undefined,
    };
  }

  return {
    ...options,
    // Critical BullMQ requirements:
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  };
}
