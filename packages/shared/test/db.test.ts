import { describe, it } from "node:test";
import assert from "node:assert";
import {
  generateEmailIdempotencyKey,
  checkDatabaseHealth,
  prisma,
  EmailStatus,
  CampaignStatus,
} from "../src/index.js";

describe("Database Utility Module", () => {
  it("instantiates PrismaClient singleton", () => {
    assert.ok(prisma);
    assert.strictEqual(typeof prisma.$connect, "function");
    assert.strictEqual(typeof prisma.$disconnect, "function");
  });

  it("exports matching enums for EmailStatus and CampaignStatus", () => {
    assert.strictEqual(EmailStatus.SCHEDULED, "SCHEDULED");
    assert.strictEqual(EmailStatus.PROCESSING, "PROCESSING");
    assert.strictEqual(EmailStatus.SENT, "SENT");
    assert.strictEqual(EmailStatus.FAILED, "FAILED");
    assert.strictEqual(EmailStatus.RESCHEDULED, "RESCHEDULED");

    assert.strictEqual(CampaignStatus.SCHEDULED, "SCHEDULED");
    assert.strictEqual(CampaignStatus.IN_PROGRESS, "IN_PROGRESS");
    assert.strictEqual(CampaignStatus.COMPLETED, "COMPLETED");
  });

  it("generates consistent and deterministic idempotency keys", () => {
    const key1 = generateEmailIdempotencyKey({
      userId: "usr-123",
      campaignId: "cmp-456",
      senderEmail: "Sender@Example.com",
      recipientEmail: "Recipient@Domain.ORG",
      subject: "Test Subject",
      body: "Message body",
      scheduledAt: "2026-10-01T12:00:00.000Z",
    });

    const key2 = generateEmailIdempotencyKey({
      userId: "usr-123",
      campaignId: "cmp-456",
      senderEmail: "  sender@example.com  ",
      recipientEmail: "recipient@domain.org",
      subject: "Test Subject",
      body: "Message body",
      scheduledAt: new Date("2026-10-01T12:00:00.000Z"),
    });

    assert.strictEqual(key1, key2);
    assert.match(key1, /^[a-f0-9]{64}$/);
    assert.notStrictEqual(
      key1,
      generateEmailIdempotencyKey({
        userId: "usr-123",
        campaignId: "cmp-456",
        senderEmail: "sender@example.com",
        recipientEmail: "recipient@domain.org",
        subject: "Test Subject",
        body: "Different body",
        scheduledAt: "2026-10-01T12:00:00.000Z",
      }),
    );
  });

  it("handles database health check without throwing", async () => {
    const health = await checkDatabaseHealth();
    assert.strictEqual(typeof health.connected, "boolean");
    assert.strictEqual(typeof health.latencyMs, "number");
  });
});
