import { describe, it } from "node:test";
import assert from "node:assert";
import {
  coordinateSendDelay,
  getNextAllowedSendTime,
  resetSendDelay,
  DELAY_COORDINATOR_KEYS,
} from "../src/queue/delay-coordinator.js";

describe("Distributed Minimum Delay Coordinator (Redis)", () => {
  it("generates correct Redis keys for senders and global scopes", () => {
    assert.strictEqual(
      DELAY_COORDINATOR_KEYS.senderKey("sender-abc"),
      "email-delay:sender:sender-abc",
    );
    assert.strictEqual(
      DELAY_COORDINATOR_KEYS.globalKey(),
      "email-delay:global",
    );
  });

  it("immediately returns zero delay when minDelayMs is zero or negative", async () => {
    const res = await coordinateSendDelay({
      senderId: "test-sender-1",
      minDelayMs: 0,
      now: 10000,
    });

    assert.strictEqual(res.waitMs, 0);
    assert.strictEqual(res.scheduledSendTime, 10000);
  });

  it("coordinates delay correctly with an in-memory Redis mock executing Lua logic", async () => {
    // In-memory mock simulating Redis GET, SET, and Lua eval
    const store = new Map<string, string>();

    const mockRedis: any = {
      async eval(
        _script: string,
        _numKeys: number,
        key: string,
        nowStr: string,
        delayStr: string,
      ) {
        const clientNow = parseInt(nowStr, 10);
        const minDelayMs = parseInt(delayStr, 10);

        const lastScheduledTime = store.get(key);
        let sendTime = clientNow;

        if (lastScheduledTime) {
          const lastTime = parseInt(lastScheduledTime, 10);
          if (lastTime && lastTime > clientNow) {
            sendTime = lastTime;
          }
        }

        const nextAvailableTime = sendTime + minDelayMs;
        store.set(key, nextAvailableTime.toString());

        const waitMs = Math.max(0, sendTime - clientNow);
        return [waitMs, sendTime.toString()];
      },
      async get(key: string) {
        return store.get(key) || null;
      },
      async del(key: string) {
        store.delete(key);
      },
    };

    const senderA = "sender-A";
    const senderB = "sender-B";
    const minDelayMs = 2000;
    const baseTime = 100000;

    // 1. First email from sender A at baseTime (100000)
    const call1 = await coordinateSendDelay({
      senderId: senderA,
      minDelayMs,
      now: baseTime,
      redisClient: mockRedis,
    });
    assert.strictEqual(
      call1.waitMs,
      0,
      "First send should have zero wait time",
    );
    assert.strictEqual(call1.available, true);
    assert.strictEqual(call1.scheduledSendTime, baseTime);

    // 2. Second email from sender A arriving 50ms later (100050)
    const call2 = await coordinateSendDelay({
      senderId: senderA,
      minDelayMs,
      now: baseTime + 50,
      redisClient: mockRedis,
    });
    assert.strictEqual(
      call2.waitMs,
      1950,
      "Second send must wait remaining delay",
    );
    assert.strictEqual(call2.scheduledSendTime, baseTime + minDelayMs);

    // 3. Third email from sender A arriving 100ms later (100100)
    const call3 = await coordinateSendDelay({
      senderId: senderA,
      minDelayMs,
      now: baseTime + 100,
      redisClient: mockRedis,
    });
    assert.strictEqual(
      call3.waitMs,
      3900,
      "Third send must wait for second send to clear + minDelay",
    );
    assert.strictEqual(call3.scheduledSendTime, baseTime + 2 * minDelayMs);

    // 4. Per-Sender Isolation: Email from sender B at same baseTime (100000)
    // Sender B should NOT be delayed by Sender A's activity
    const callSenderB = await coordinateSendDelay({
      senderId: senderB,
      minDelayMs,
      now: baseTime,
      redisClient: mockRedis,
    });
    assert.strictEqual(
      callSenderB.waitMs,
      0,
      "Sender B should execute immediately despite Sender A queue",
    );
    assert.strictEqual(callSenderB.scheduledSendTime, baseTime);

    // 5. Query next allowed time
    const nextAllowedA = await getNextAllowedSendTime(senderA, mockRedis);
    assert.strictEqual(nextAllowedA, baseTime + 3 * minDelayMs);

    // 6. Reset sender delay
    await resetSendDelay(senderA, mockRedis);
    const resetTimeA = await getNextAllowedSendTime(senderA, mockRedis);
    assert.strictEqual(resetTimeA, null);
  });

  it("reports Redis failure so the worker can defer sending", async () => {
    const brokenRedis: any = {
      async eval() {
        throw new Error("Redis cluster node connection lost");
      },
    };

    const res = await coordinateSendDelay({
      senderId: "fault-tolerant-sender",
      minDelayMs: 2000,
      now: 50000,
      redisClient: brokenRedis,
    });

    assert.strictEqual(res.waitMs, 2000);
    assert.strictEqual(res.available, false);
    assert.strictEqual(res.scheduledSendTime, 50000);
  });
});
