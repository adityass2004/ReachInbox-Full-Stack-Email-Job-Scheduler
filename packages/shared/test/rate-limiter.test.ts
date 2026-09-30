import { describe, it } from "node:test";
import assert from "node:assert";
import {
  consumeHourlyRateLimit,
  decrementHourlyRateLimit,
  getCurrentHourUsage,
  resetHourlyRateLimit,
  getHourWindowString,
  getNextHourlyWindowStart,
  RATE_LIMIT_KEYS,
} from "../src/queue/rate-limiter.js";

describe("Distributed Hourly Rate Limiter (Redis)", () => {
  it("formats UTC hour windows consistently (YYYY-MM-DD-HH)", () => {
    // 2026-10-15 14:32:45 UTC
    const date = new Date(Date.UTC(2026, 9, 15, 14, 32, 45));
    const window = getHourWindowString(date);
    assert.strictEqual(window, "2026-10-15-14");

    const key = RATE_LIMIT_KEYS.senderHourKey("sender-123", window);
    assert.strictEqual(key, "email-rate:sender-123:2026-10-15-14");
  });

  it("calculates the exact start of the next hourly window across hour and day boundaries", () => {
    // 14:25 UTC -> next is 15:00 UTC
    const midHour = new Date(Date.UTC(2026, 9, 15, 14, 25, 30));
    const nextWindow = getNextHourlyWindowStart(midHour);
    assert.strictEqual(nextWindow.getUTCHours(), 15);
    assert.strictEqual(nextWindow.getUTCMinutes(), 0);
    assert.strictEqual(nextWindow.getUTCSeconds(), 0);
    assert.strictEqual(nextWindow.getUTCMilliseconds(), 0);

    // 23:59 UTC -> next is 00:00 UTC on next day
    const endOfDay = new Date(Date.UTC(2026, 9, 15, 23, 59, 59));
    const nextDayWindow = getNextHourlyWindowStart(endOfDay);
    assert.strictEqual(nextDayWindow.getUTCDate(), 16);
    assert.strictEqual(nextDayWindow.getUTCHours(), 0);
  });

  it("enforces hourly limit atomically with simulated Redis store", async () => {
    const store = new Map<string, string>();

    const mockRedis: any = {
      async eval(
        script: string,
        _numKeys: number,
        key: string,
        limitStr: string,
      ) {
        if (script.includes("DECR")) {
          const count = parseInt(store.get(key) || "0", 10);
          const updated = Math.max(0, count - 1);
          if (updated > 0) store.set(key, updated.toString());
          else store.delete(key);
          return updated;
        }

        const limit = parseInt(limitStr, 10);
        const current = store.get(key);
        const count = current ? parseInt(current, 10) : 0;

        if (count >= limit) {
          return [0, count];
        } else {
          const newCount = count + 1;
          store.set(key, newCount.toString());
          return [1, newCount];
        }
      },
      async get(key: string) {
        return store.get(key) || null;
      },
      async decr(key: string) {
        const current = store.get(key);
        if (current) {
          const count = Math.max(0, parseInt(current, 10) - 1);
          store.set(key, count.toString());
          return count;
        }
        return 0;
      },
      async del(key: string) {
        store.delete(key);
      },
    };

    const senderA = "sender-alpha";
    const senderB = "sender-beta";
    const limit = 3;
    const testTime = new Date(Date.UTC(2026, 9, 1, 10, 0, 0)).getTime();

    // 1. Consume 1st token
    const res1 = await consumeHourlyRateLimit({
      senderId: senderA,
      limit,
      now: testTime,
      redisClient: mockRedis,
    });
    assert.strictEqual(res1.allowed, true);
    assert.strictEqual(res1.currentUsage, 1);
    assert.strictEqual(res1.remaining, 2);

    // 2. Consume 2nd token
    const res2 = await consumeHourlyRateLimit({
      senderId: senderA,
      limit,
      now: testTime,
      redisClient: mockRedis,
    });
    assert.strictEqual(res2.allowed, true);
    assert.strictEqual(res2.currentUsage, 2);
    assert.strictEqual(res2.remaining, 1);

    // 3. Consume 3rd token (exhausts limit)
    const res3 = await consumeHourlyRateLimit({
      senderId: senderA,
      limit,
      now: testTime,
      redisClient: mockRedis,
    });
    assert.strictEqual(res3.allowed, true);
    assert.strictEqual(res3.currentUsage, 3);
    assert.strictEqual(res3.remaining, 0);

    // 4. 4th attempt must be REJECTED without dropping
    const res4 = await consumeHourlyRateLimit({
      senderId: senderA,
      limit,
      now: testTime,
      redisClient: mockRedis,
    });
    assert.strictEqual(
      res4.allowed,
      false,
      "4th attempt should exceed hourly limit",
    );
    assert.strictEqual(res4.currentUsage, 3);
    assert.ok(res4.delayUntilNextWindowMs > 0);

    // 5. Per-sender isolation: Sender B has their own independent limit
    const resB = await consumeHourlyRateLimit({
      senderId: senderB,
      limit,
      now: testTime,
      redisClient: mockRedis,
    });
    assert.strictEqual(
      resB.allowed,
      true,
      "Sender B should have independent quota",
    );
    assert.strictEqual(resB.currentUsage, 1);

    // 6. Roll back 1 quota token for sender A
    await decrementHourlyRateLimit(senderA, res1.hourWindow, mockRedis);
    const usageAfterRollback = await getCurrentHourUsage(
      senderA,
      res1.hourWindow,
      mockRedis,
    );
    assert.strictEqual(usageAfterRollback, 2);

    // 7. Sender A can now send again
    const res5 = await consumeHourlyRateLimit({
      senderId: senderA,
      limit,
      now: testTime,
      redisClient: mockRedis,
    });
    assert.strictEqual(res5.allowed, true);
    assert.strictEqual(res5.currentUsage, 3);

    // 8. Reset rate limit
    await resetHourlyRateLimit(senderA, res1.hourWindow, mockRedis);
    const usageAfterReset = await getCurrentHourUsage(
      senderA,
      res1.hourWindow,
      mockRedis,
    );
    assert.strictEqual(usageAfterReset, 0);
  });

  it("defers sends when Redis is unavailable", async () => {
    const brokenRedis: any = {
      async eval() {
        throw new Error("Redis cluster node timeout");
      },
    };

    const res = await consumeHourlyRateLimit({
      senderId: "fault-tolerant-sender",
      limit: 100,
      redisClient: brokenRedis,
    });

    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.storageAvailable, false);
  });
});
