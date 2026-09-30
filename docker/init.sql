-- PostgreSQL Schema Initialization for ReachInbox Local Docker Environment
-- Automatically executed by the postgres container on first startup (/docker-entrypoint-initdb.d)

-- CreateEnum: EmailStatus
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailStatus') THEN
        CREATE TYPE "EmailStatus" AS ENUM ('SCHEDULED', 'PROCESSING', 'RATE_LIMITED', 'RESCHEDULED', 'SENT', 'FAILED');
    END IF;
END $$;

-- CreateEnum: CampaignStatus
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CampaignStatus') THEN
        CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'PAUSED', 'CANCELLED');
    END IF;
END $$;

-- CreateTable: users
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "googleId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: senders
CREATE TABLE IF NOT EXISTS "senders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "etherealHost" TEXT DEFAULT 'smtp.ethereal.email',
    "etherealPort" INTEGER DEFAULT 587,
    "etherealUser" TEXT,
    "etherealPassword" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable: campaigns
CREATE TABLE IF NOT EXISTS "campaigns" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "delayMs" INTEGER NOT NULL DEFAULT 2000,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 200,
    "status" "CampaignStatus" NOT NULL DEFAULT 'SCHEDULED',
    "totalEmails" INTEGER NOT NULL DEFAULT 0,
    "sentEmails" INTEGER NOT NULL DEFAULT 0,
    "failedEmails" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable: email_jobs
CREATE TABLE IF NOT EXISTS "email_jobs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "senderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "rescheduledAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "status" "EmailStatus" NOT NULL DEFAULT 'SCHEDULED',
    "bullJobId" TEXT,
    "messageId" TEXT,
    "etherealPreviewUrl" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: slack_connections
CREATE TABLE IF NOT EXISTS "slack_connections" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "teamId" TEXT,
    "teamName" TEXT,
    "channelId" TEXT,
    "channelName" TEXT,
    "incomingWebhookUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable: slack_oauth_states
CREATE TABLE IF NOT EXISTS "slack_oauth_states" (
    "stateHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slack_oauth_states_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable: google_oauth_states
CREATE TABLE IF NOT EXISTS "google_oauth_states" (
    "stateHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_oauth_states_pkey" PRIMARY KEY ("stateHash")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_googleId_key" ON "users"("googleId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
CREATE INDEX IF NOT EXISTS "senders_userId_idx" ON "senders"("userId");
CREATE INDEX IF NOT EXISTS "senders_email_idx" ON "senders"("email");
CREATE INDEX IF NOT EXISTS "campaigns_userId_idx" ON "campaigns"("userId");
CREATE INDEX IF NOT EXISTS "campaigns_status_idx" ON "campaigns"("status");
CREATE INDEX IF NOT EXISTS "campaigns_startTime_idx" ON "campaigns"("startTime");
CREATE UNIQUE INDEX IF NOT EXISTS "email_jobs_idempotencyKey_key" ON "email_jobs"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "email_jobs_userId_status_idx" ON "email_jobs"("userId", "status");
CREATE INDEX IF NOT EXISTS "email_jobs_status_scheduledAt_idx" ON "email_jobs"("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "email_jobs_senderId_scheduledAt_idx" ON "email_jobs"("senderId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "email_jobs_campaignId_idx" ON "email_jobs"("campaignId");
CREATE INDEX IF NOT EXISTS "email_jobs_bullJobId_idx" ON "email_jobs"("bullJobId");
CREATE INDEX IF NOT EXISTS "email_jobs_recipient_idx" ON "email_jobs"("recipient");
CREATE UNIQUE INDEX IF NOT EXISTS "slack_connections_userId_key" ON "slack_connections"("userId");
CREATE INDEX IF NOT EXISTS "slack_connections_userId_idx" ON "slack_connections"("userId");
CREATE INDEX IF NOT EXISTS "slack_oauth_states_userId_idx" ON "slack_oauth_states"("userId");
CREATE INDEX IF NOT EXISTS "slack_oauth_states_expiresAt_idx" ON "slack_oauth_states"("expiresAt");
CREATE INDEX IF NOT EXISTS "google_oauth_states_expiresAt_idx" ON "google_oauth_states"("expiresAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'senders_userId_fkey') THEN
        ALTER TABLE "senders" ADD CONSTRAINT "senders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_userId_fkey') THEN
        ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_jobs_campaignId_fkey') THEN
        ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_jobs_senderId_fkey') THEN
        ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_jobs_userId_fkey') THEN
        ALTER TABLE "email_jobs" ADD CONSTRAINT "email_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slack_connections_userId_fkey') THEN
        ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slack_oauth_states_userId_fkey') THEN
        ALTER TABLE "slack_oauth_states" ADD CONSTRAINT "slack_oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
