/**
 * Safe dev seed script for ReachInbox Email Scheduler.
 * Idempotent: Can be run multiple times safely without creating duplicates.
 */

import { PrismaClient, EmailStatus, CampaignStatus } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root if it exists
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting safe dev seed...");

  if (!process.env.DATABASE_URL) {
    console.warn("⚠️  DATABASE_URL environment variable is not set.");
    console.warn("   To run the seed script with live PostgreSQL:");
    console.warn("   1. Copy .env.example to .env and configure DATABASE_URL");
    console.warn("   2. Run `pnpm db:push` or `pnpm db:migrate`");
    console.warn("   3. Run `pnpm db:seed`");
    return;
  }

  try {
    // 1. Upsert default demo user
    const demoUser = await prisma.user.upsert({
      where: { email: "demo@reachinbox.local" },
      update: {
        name: "Demo Admin",
      },
      create: {
        email: "demo@reachinbox.local",
        name: "Demo Admin",
        googleId: "google-oauth-demo-user-12345",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=DemoAdmin",
      },
    });
    console.log(`✓ User ensured: ${demoUser.email} (${demoUser.id})`);

    // 2. Upsert default sender
    const defaultSender = await prisma.sender.upsert({
      where: { id: "00000000-0000-0000-0000-000000000001" },
      update: {
        email: "demo-sender@ethereal.email",
        displayName: "Demo ReachInbox Sender",
        active: true,
      },
      create: {
        id: "00000000-0000-0000-0000-000000000001",
        userId: demoUser.id,
        email: "demo-sender@ethereal.email",
        displayName: "Demo ReachInbox Sender",
        etherealHost: process.env.ETHEREAL_HOST || "smtp.ethereal.email",
        etherealPort: parseInt(process.env.ETHEREAL_PORT || "587", 10),
        etherealUser: process.env.ETHEREAL_USER || "",
        etherealPassword: process.env.ETHEREAL_PASSWORD || "",
        active: true,
      },
    });
    console.log(
      `✓ Sender ensured: ${defaultSender.email} (${defaultSender.id})`,
    );

    // 3. Upsert sample campaign
    const defaultCampaign = await prisma.campaign.upsert({
      where: { id: "00000000-0000-0000-0000-000000000002" },
      update: {
        subject: "Welcome to ReachInbox Scheduler!",
      },
      create: {
        id: "00000000-0000-0000-0000-000000000002",
        userId: demoUser.id,
        subject: "Welcome to ReachInbox Scheduler!",
        body: "<h1>Hello!</h1><p>Welcome to our ReachInbox email distribution test.</p>",
        startTime: new Date(),
        delayMs: 2000,
        hourlyLimit: 200,
        status: CampaignStatus.IN_PROGRESS,
        totalEmails: 2,
        sentEmails: 1,
        failedEmails: 0,
      },
    });
    console.log(
      `✓ Campaign ensured: ${defaultCampaign.subject} (${defaultCampaign.id})`,
    );

    // 4. Upsert sample email jobs with deterministic idempotency keys
    const sampleJobs = [
      {
        id: "00000000-0000-0000-0000-000000000003",
        recipient: "recipient1@example.com",
        subject: "Welcome to ReachInbox Scheduler!",
        body: "<p>Hi Recipient 1, this email was delivered via Ethereal SMTP!</p>",
        status: EmailStatus.SENT,
        scheduledAt: new Date(Date.now() - 3600000), // 1 hour ago
        sentAt: new Date(Date.now() - 3598000),
        idempotencyKey: "seed::recipient1::welcome",
      },
      {
        id: "00000000-0000-0000-0000-000000000004",
        recipient: "recipient2@example.com",
        subject: "Welcome to ReachInbox Scheduler!",
        body: "<p>Hi Recipient 2, this email is scheduled for upcoming delivery.</p>",
        status: EmailStatus.SCHEDULED,
        scheduledAt: new Date(Date.now() + 3600000), // 1 hour in future
        idempotencyKey: "seed::recipient2::welcome",
      },
    ];

    for (const job of sampleJobs) {
      await prisma.emailJob.upsert({
        where: { idempotencyKey: job.idempotencyKey },
        update: {
          status: job.status,
          sentAt: job.sentAt ?? null,
        },
        create: {
          id: job.id,
          campaignId: defaultCampaign.id,
          senderId: defaultSender.id,
          userId: demoUser.id,
          recipient: job.recipient,
          subject: job.subject,
          body: job.body,
          scheduledAt: job.scheduledAt,
          sentAt: job.sentAt ?? null,
          status: job.status,
          idempotencyKey: job.idempotencyKey,
        },
      });
      console.log(`✓ EmailJob ensured: ${job.recipient} [${job.status}]`);
    }

    console.log("✅ Dev seed completed successfully.");
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      (error.message.includes("Can't reach database server") ||
        error.message.includes("ECONNREFUSED") ||
        error.message.includes("P1001"))
    ) {
      console.warn("⚠️  Database server is currently offline or unreachable.");
      console.warn("   To run the seed script with live PostgreSQL:");
      console.warn("   1. Ensure DATABASE_URL is set in .env");
      console.warn("   2. Run `pnpm db:push` or `pnpm db:migrate`");
      console.warn("   3. Run `pnpm db:seed`");
    } else {
      console.error("❌ Error during dev seed:", error);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
