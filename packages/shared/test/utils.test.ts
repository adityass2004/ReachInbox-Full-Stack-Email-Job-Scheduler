import { describe, it } from "node:test";
import assert from "node:assert";
import {
  decryptSlackToken,
  encryptSlackToken,
  hasValidSlackTokenEncryptionKey,
} from "../src/utils/index.js";
import {
  normalizeEmail,
  isValidEmail,
  sanitizeAndDeduplicateEmails,
} from "../src/utils/index.js";

describe("Shared Email Utilities", () => {
  it("normalizes email casing and trims spaces", () => {
    assert.strictEqual(
      normalizeEmail("  Test@Example.COM  "),
      "test@example.com",
    );
  });

  it("validates email formats accurately", () => {
    assert.strictEqual(isValidEmail("user@domain.com"), true);
    assert.strictEqual(isValidEmail("invalid-email"), false);
    assert.strictEqual(isValidEmail("@nodomain.com"), false);
    assert.strictEqual(isValidEmail("spaces in@domain.com"), false);
  });

  it("deduplicates and sanitizes a list of emails", () => {
    const raw = [
      "Alice@example.com",
      "bob@example.com",
      " alice@example.com ",
      "invalid-email",
      "BOB@example.com",
      "charlie@domain.org",
    ];

    const result = sanitizeAndDeduplicateEmails(raw);
    assert.deepStrictEqual(result, [
      "alice@example.com",
      "bob@example.com",
      "charlie@domain.org",
    ]);
  });
});

describe("Slack token encryption", () => {
  it("encrypts tokens and decrypts them with the configured key", () => {
    const originalKey = process.env.SLACK_TOKEN_ENCRYPTION_KEY;
    process.env.SLACK_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

    try {
      const encrypted = encryptSlackToken("xoxb-secret-token");
      assert.notStrictEqual(encrypted, "xoxb-secret-token");
      assert.strictEqual(hasValidSlackTokenEncryptionKey(), true);
      assert.strictEqual(decryptSlackToken(encrypted), "xoxb-secret-token");
    } finally {
      if (originalKey === undefined) {
        delete process.env.SLACK_TOKEN_ENCRYPTION_KEY;
      } else {
        process.env.SLACK_TOKEN_ENCRYPTION_KEY = originalKey;
      }
    }
  });

  it("rejects a missing or malformed encryption key", () => {
    const originalKey = process.env.SLACK_TOKEN_ENCRYPTION_KEY;
    delete process.env.SLACK_TOKEN_ENCRYPTION_KEY;
    assert.strictEqual(hasValidSlackTokenEncryptionKey(), false);

    try {
      assert.throws(() => encryptSlackToken("xoxb-secret-token"));
      process.env.SLACK_TOKEN_ENCRYPTION_KEY = "not-a-valid-key";
      assert.strictEqual(hasValidSlackTokenEncryptionKey(), false);
      assert.throws(() => encryptSlackToken("xoxb-secret-token"));
    } finally {
      if (originalKey !== undefined) {
        process.env.SLACK_TOKEN_ENCRYPTION_KEY = originalKey;
      }
    }
  });
});
