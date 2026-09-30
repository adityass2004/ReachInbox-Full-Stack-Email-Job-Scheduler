import { describe, it, after } from "node:test";
import assert from "node:assert";
import { runRecoveryCheck } from "../src/queue/recovery.js";
import { closeEmailQueue } from "../src/queue/email-queue.js";
import { closeSharedRedisConnection } from "../src/queue/connection.js";
import {
  generateEmailIdempotencyKey,
  disconnectDatabase,
} from "../src/db/index.js";

describe("Restart Recovery & Idempotency Hardening", () => {
  after(async () => {
    try {
      await closeEmailQueue();
      await closeSharedRedisConnection();
      await disconnectDatabase();
    } catch {
      // Ignore cleanup errors
    }
  });

  it("generates reproducible idempotency keys for repeated API requests", () => {
    const payload = {
      userId: "user-xyz",
      senderEmail: "sales@company.com",
      recipientEmail: "lead@target.com",
      subject: "Demo Request Confirmation",
      body: "Welcome to our product.",
      scheduledAt: new Date("2026-10-01T15:00:00.000Z"),
    };

    const keyA = generateEmailIdempotencyKey(payload);
    const keyB = generateEmailIdempotencyKey({
      ...payload,
      senderEmail: "  SALES@company.com ",
      recipientEmail: "lead@target.COM  ",
    });

    assert.strictEqual(keyA, keyB);
    assert.notStrictEqual(
      keyA,
      generateEmailIdempotencyKey({ ...payload, body: "Different message" }),
    );
  });

  it("runRecoveryCheck executes gracefully and returns a structured report", async () => {
    const report = await runRecoveryCheck({ stuckTimeoutMs: 1000 });
    assert.ok(typeof report.reconciledScheduledJobs === "number");
    assert.ok(typeof report.recoveredStuckProcessingJobs === "number");
    assert.ok(typeof report.failedStuckJobs === "number");
    assert.ok(Array.isArray(report.errors));
  });
});
