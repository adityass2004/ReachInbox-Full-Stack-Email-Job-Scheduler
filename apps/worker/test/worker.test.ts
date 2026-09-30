import { describe, it } from "node:test";
import assert from "node:assert";
import { config } from "../src/config/env.js";
import { encryptSlackToken } from "@reachinbox/shared";
import {
  formatSlackRateLimitMessage,
  notifySlackRateLimit,
  slackRateLimitDedupeKey,
} from "../src/services/slack-notification.service.js";

describe("Worker Service Configuration", () => {
  it("loads valid default concurrency and delays", () => {
    assert.strictEqual(typeof config.concurrency, "number");
    assert.strictEqual(typeof config.minEmailDelayMs, "number");
    assert.strictEqual(typeof config.maxEmailsPerHour, "number");
    assert.ok(config.concurrency > 0);
    assert.ok(config.minEmailDelayMs >= 0);
    assert.ok(config.maxEmailsPerHour > 0);
    assert.strictEqual(config.serviceName, "reachinbox-worker");
  });

  it("safeguards against non-numeric or invalid concurrency and delay env values", () => {
    const parseConcurrency = (val: string | undefined, defaultVal: number) => {
      const parsed = parseInt(val || String(defaultVal), 10);
      return !isNaN(parsed) && parsed > 0 ? parsed : defaultVal;
    };

    const parseDelay = (val: string | undefined, defaultVal: number) => {
      const parsed = parseInt(val || String(defaultVal), 10);
      return !isNaN(parsed) && parsed >= 0 ? parsed : defaultVal;
    };

    assert.strictEqual(parseConcurrency("10", 5), 10);
    assert.strictEqual(parseConcurrency("-2", 5), 5);
    assert.strictEqual(parseConcurrency("invalid", 5), 5);
    assert.strictEqual(parseConcurrency(undefined, 5), 5);

    assert.strictEqual(parseDelay("3000", 2000), 3000);
    assert.strictEqual(parseDelay("-100", 2000), 2000);
    assert.strictEqual(parseDelay("not-a-number", 2000), 2000);
  });
});

describe("Slack rate-limit notification", () => {
  const notification = {
    userId: "user-1",
    senderId: "sender-1",
    senderEmail: "sender@example.com",
    limit: 10,
    emailJobId: "job-1",
    hourWindow: "2026-09-30-10",
    nextWindow: new Date("2026-09-30T11:00:00.000Z"),
  };

  it("formats the required message and stable per-sender window key", () => {
    assert.strictEqual(
      formatSlackRateLimitMessage(notification),
      "Sender sender@example.com reached hourly limit (10). Job job-1 rescheduled to 2026-09-30T11:00:00.000Z.",
    );
    assert.strictEqual(
      slackRateLimitDedupeKey("sender-1", "2026-09-30-10"),
      "slack-rate-limit-notified:sender-1:2026-09-30-10",
    );
  });

  it("does nothing when Slack is disconnected", async () => {
    let posted = false;
    await notifySlackRateLimit(notification, {
      async getConnection() {
        return null;
      },
      async claimEvent() {
        throw new Error("Should not claim without a connection");
      },
      async postMessage() {
        posted = true;
      },
    });
    assert.strictEqual(posted, false);
  });

  it("deduplicates notifications and swallows Slack failures", async () => {
    const previousKey = process.env.SLACK_TOKEN_ENCRYPTION_KEY;
    process.env.SLACK_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const encryptedToken = encryptSlackToken("xoxb-test-token");
    let postCount = 0;
    const dependencies = {
      async getConnection() {
        return {
          active: true,
          encryptedToken,
          channelId: "C123",
        };
      },
      async claimEvent() {
        return false;
      },
      async postMessage() {
        postCount++;
        throw new Error("Slack API unavailable");
      },
    };

    try {
      await notifySlackRateLimit(notification, dependencies);
      assert.strictEqual(postCount, 0);

      await notifySlackRateLimit(notification, {
        ...dependencies,
        async claimEvent() {
          return true;
        },
        async postMessage() {
          postCount++;
          throw new Error("Slack API unavailable");
        },
      });
      assert.strictEqual(postCount, 1);
    } finally {
      if (previousKey === undefined) delete process.env.SLACK_TOKEN_ENCRYPTION_KEY;
      else process.env.SLACK_TOKEN_ENCRYPTION_KEY = previousKey;
    }
  });
});
