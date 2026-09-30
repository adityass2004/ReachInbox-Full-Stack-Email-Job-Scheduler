import { describe, it } from "node:test";
import assert from "node:assert";
import { etherealSmtpService } from "../src/services/ethereal-smtp.service.js";
import { logger } from "../src/logger.js";

describe("Worker Ethereal SMTP & Processing Logic", () => {
  it("correctly classifies transient vs permanent SMTP errors", () => {
    // Transient network / socket errors
    assert.strictEqual(
      etherealSmtpService.isTransientError({ code: "ECONNRESET" }),
      true,
    );
    assert.strictEqual(
      etherealSmtpService.isTransientError({ code: "ETIMEDOUT" }),
      true,
    );
    assert.strictEqual(
      etherealSmtpService.isTransientError({ code: "ESOCKET" }),
      true,
    );

    // Transient 4xx SMTP status codes
    assert.strictEqual(
      etherealSmtpService.isTransientError({ responseCode: 421 }),
      true,
    );
    assert.strictEqual(
      etherealSmtpService.isTransientError({ responseCode: 450 }),
      true,
    );
    assert.strictEqual(
      etherealSmtpService.isTransientError({
        message: "Mail server temporarily unavailable",
      }),
      true,
    );

    // Permanent 5xx errors or validation rejections
    assert.strictEqual(
      etherealSmtpService.isTransientError({ responseCode: 550 }),
      false,
    );
    assert.strictEqual(
      etherealSmtpService.isTransientError({ code: "EENVELOPE" }),
      false,
    );
    assert.strictEqual(
      etherealSmtpService.isTransientError({ message: "User does not exist" }),
      false,
    );
    assert.strictEqual(etherealSmtpService.isTransientError(null), false);
  });

  it("structured logger methods execute without errors", () => {
    logger.info("TEST_EVENT", "Test info log", { testKey: "testVal" });
    logger.warn("TEST_WARN", "Test warning log", { count: 1 });
    logger.error("TEST_ERROR", "Test error log", { error: "Test message" });
    assert.ok(true);
  });
});
