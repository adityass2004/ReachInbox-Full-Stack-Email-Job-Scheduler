import { describe, it } from "node:test";
import assert from "node:assert";
import {
  QUEUE_NAMES,
  JOB_NAMES,
  DEFAULT_JOB_OPTIONS,
  getRedisConnectionOptions,
  calculateDelayMs,
  checkRedisHealth,
} from "../src/index.js";

describe("BullMQ Queue Configuration & Infrastructure", () => {
  it("defines correct queue and job names per specifications", () => {
    assert.strictEqual(QUEUE_NAMES.EMAIL_SEND, "email-send");
    assert.strictEqual(JOB_NAMES.SEND_EMAIL, "send-email");
  });

  it("configures proper retry, backoff, and retention policies", () => {
    assert.strictEqual(DEFAULT_JOB_OPTIONS.attempts, 3);
    assert.deepStrictEqual(DEFAULT_JOB_OPTIONS.backoff, {
      type: "exponential",
      delay: 5000,
    });

    assert.ok(DEFAULT_JOB_OPTIONS.removeOnComplete);
    assert.ok(DEFAULT_JOB_OPTIONS.removeOnFail);
  });

  it("generates valid Redis connection options for BullMQ with null maxRetriesPerRequest", () => {
    const options = getRedisConnectionOptions();
    assert.strictEqual(options.maxRetriesPerRequest, null);
    assert.strictEqual(options.enableReadyCheck, false);
    assert.strictEqual(options.lazyConnect, true);
    assert.ok(typeof options.port === "number");
    assert.ok(typeof options.host === "string");
  });

  it("verifies Redis TLS certificates for rediss connections", () => {
    const originalUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = "rediss://redis.example.com:6380";

    try {
      const options = getRedisConnectionOptions();
      assert.strictEqual(options.tls?.rejectUnauthorized, true);
    } finally {
      if (originalUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = originalUrl;
    }
  });

  it("calculates delay accurately for delayed jobs", () => {
    const now = Date.now();
    const tenSecondsFuture = new Date(now + 10000);
    const delay = calculateDelayMs(tenSecondsFuture);
    assert.ok(delay >= 9500 && delay <= 10500);

    const pastTime = new Date(now - 10000);
    const pastDelay = calculateDelayMs(pastTime);
    assert.strictEqual(pastDelay, 0);
  });

  it("gracefully checks Redis health without unhandled errors", async () => {
    const health = await checkRedisHealth();
    assert.strictEqual(typeof health.connected, "boolean");
    assert.strictEqual(typeof health.latencyMs, "number");
  });
});
