import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getSlackTokenEncryptionKey(): Buffer {
  const value = process.env.SLACK_TOKEN_ENCRYPTION_KEY;
  const key = value ? Buffer.from(value, "base64") : Buffer.alloc(0);

  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("SLACK_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }

  return key;
}

export function hasValidSlackTokenEncryptionKey(): boolean {
  try {
    getSlackTokenEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSlackToken(token: string): string {
  const key = getSlackTokenEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);

  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSlackToken(encryptedToken: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext] = encryptedToken.split(":");
  if (version !== "v1" || !encodedIv || !encodedTag || encodedCiphertext === undefined) {
    throw new Error("Unsupported encrypted Slack token format");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getSlackTokenEncryptionKey(),
    Buffer.from(encodedIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Normalizes an email address by trimming whitespace and converting to lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Basic email format validator following RFC 5322 standard regex.
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(normalizeEmail(email));
}

/**
 * Deduplicates and filters a list of raw email strings.
 */
export function sanitizeAndDeduplicateEmails(rawEmails: string[]): string[] {
  const seen = new Set<string>();
  const validEmails: string[] = [];

  for (const raw of rawEmails) {
    const clean = normalizeEmail(raw);
    if (isValidEmail(clean) && !seen.has(clean)) {
      seen.add(clean);
      validEmails.push(clean);
    }
  }

  return validEmails;
}

/**
 * Simple promise-based sleep utility.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sanitizes email HTML body content to prevent script injection (XSS).
 * Strips dangerous tags (<script>, <iframe>, <object>, <embed>, inline event handlers, javascript: URIs).
 */
export function sanitizeEmailContent(content: string): string {
  if (!content) return "";
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^>\s]+/gi, "")
    .replace(/href\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'href="#"')
    .replace(/src\s*=\s*(['"])\s*javascript:[^'"]*\1/gi, 'src=""');
}
