import { createHash } from "node:crypto";
import {
  PrismaClient,
  Prisma,
  EmailStatus,
  CampaignStatus,
} from "@prisma/client";

// Re-export Prisma types for use across api, worker, and web
export { PrismaClient, Prisma, EmailStatus, CampaignStatus };
export type {
  User,
  Sender,
  Campaign,
  EmailJob,
  SlackConnection,
} from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __reachinbox_prisma: PrismaClient | undefined;
}

/**
 * Creates or retrieves the singleton PrismaClient instance.
 * Preserves the instance across hot module reloads in development.
 */
function createPrismaClient(): PrismaClient {
  if (process.env.DATABASE_URL) {
    let dbUrl = process.env.DATABASE_URL.replace(/^["']|["']$/g, "");
    if ((dbUrl.includes("pooler") || dbUrl.includes("6543")) && !dbUrl.includes("pgbouncer=true")) {
      dbUrl += dbUrl.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true";
    }
    process.env.DATABASE_URL = dbUrl;
  }
  if (process.env.DIRECT_URL) {
    process.env.DIRECT_URL = process.env.DIRECT_URL.replace(/^["']|["']$/g, "");
  }
  const isDev = process.env.NODE_ENV === "development";

  return new PrismaClient({
    log: isDev ? ["warn", "error"] : ["error"],
    errorFormat: isDev ? "pretty" : "minimal",
  });
}

export const prisma: PrismaClient =
  globalThis.__reachinbox_prisma ??
  (globalThis.__reachinbox_prisma = createPrismaClient());

/**
 * Verifies database connectivity with a lightweight ping query.
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (err: unknown) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown database error",
    };
  }
}

/**
 * Safely disconnects Prisma client during graceful service shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Deterministically generates an idempotency key for an email job.
 * Ensures the same logical email request cannot be queued or sent twice.
 */
export function generateEmailIdempotencyKey(params: {
  userId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body?: string;
  scheduledAt: string | Date;
  campaignId?: string;
}): string {
  const dateStr =
    params.scheduledAt instanceof Date
      ? params.scheduledAt.toISOString()
      : new Date(params.scheduledAt).toISOString();

  const identity = [
    params.userId,
    params.campaignId || "ad-hoc",
    params.senderEmail.toLowerCase().trim(),
    params.recipientEmail.toLowerCase().trim(),
    params.subject.trim(),
    params.body ?? "",
    dateStr,
  ];

  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}
