import { Job } from "bullmq";
import {
  prisma,
  EmailJobData,
  EmailJobResult,
  EmailStatus,
  CampaignStatus,
  coordinateSendDelay,
  scheduleEmailJob,
  consumeHourlyRateLimit,
  decrementHourlyRateLimit,
  emailSearchService,
  EmailSearchDocument,
} from "@reachinbox/shared";
import { etherealSmtpService } from "../services/ethereal-smtp.service.js";
import { notifySlackRateLimit } from "../services/slack-notification.service.js";
import { config } from "../config/env.js";
import { logger } from "../logger.js";

async function deferEmailJob(
  emailJobId: string,
  scheduledAt: Date,
  reason: string,
  jobIdPrefix: string,
): Promise<void> {
  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: { status: EmailStatus.RESCHEDULED, scheduledAt, failureReason: reason },
  });

  const retryJob = await scheduleEmailJob({
    emailJobId,
    scheduledAt,
    overrideDelayMs: Math.max(0, scheduledAt.getTime() - Date.now()),
    customJobOptions: {
      jobId: `${emailJobId}-${jobIdPrefix}-${scheduledAt.getTime()}`,
    },
  });

  await prisma.emailJob.update({
    where: { id: emailJobId },
    data: { bullJobId: String(retryJob.id) },
  });
}

function toSearchDocument(
  emailJob: NonNullable<Awaited<ReturnType<typeof prisma.emailJob.findUnique>>>,
  senderEmail: string,
  status: EmailStatus,
  scheduledAt: Date,
  sentAt: Date | null = null,
): EmailSearchDocument {
  return {
    emailJobId: emailJob.id,
    userId: emailJob.userId,
    recipient: emailJob.recipient,
    sender: senderEmail,
    subject: emailJob.subject,
    status,
    campaignId: emailJob.campaignId,
    scheduledAt: scheduledAt.toISOString(),
    sentAt: sentAt?.toISOString() ?? null,
  };
}

/**
 * BullMQ Job Processor for email delivery with idempotency and crash recovery hardening.
 *
 * GUARANTEES:
 * 1. Checks PostgreSQL authoritative state via atomic transition before sending.
 * 2. If a worker receives the same job twice, only the first can transition; the second skips.
 * 3. A job already marked PROCESSING is never reclaimed by a concurrent delivery.
 * 4. Stale PROCESSING jobs are retried by recovery after checking BullMQ activity.
 */
export async function processEmailJob(
  job: Job<EmailJobData, EmailJobResult>,
): Promise<EmailJobResult> {
  const { emailJobId } = job.data;
  const startTime = Date.now();

  logger.info(
    "JOB_RECEIVED",
    `Received job ${job.id} for emailJobId: ${emailJobId}`,
    {
      bullJobId: job.id,
      emailJobId,
      attempt: job.attemptsMade + 1,
    },
  );

  // 1. ATOMIC STATE TRANSITION: SCHEDULED/RESCHEDULED -> PROCESSING
  const transition = await prisma.emailJob.updateMany({
    where: {
      id: emailJobId,
      status: {
        in: [EmailStatus.SCHEDULED, EmailStatus.RESCHEDULED],
      },
    },
    data: {
      status: EmailStatus.PROCESSING,
      updatedAt: new Date(),
    },
  });

  // 2. Handle Case where transition.count === 0
  if (transition.count === 0) {
    const current = await prisma.emailJob.findUnique({
      where: { id: emailJobId },
      select: { id: true, status: true, sentAt: true, messageId: true },
    });

    if (!current) {
      logger.warn(
        "STATUS_SKIPPED",
        `Job ${emailJobId} not found in database. Skipping.`,
        {
          emailJobId,
        },
      );
      return {
        emailJobId,
        success: false,
        error: "Record not found in database",
      };
    }

    // SCENARIO 2 & 3: Already delivered previously
    if (current.status === EmailStatus.SENT || current.messageId) {
      logger.info(
        "STATUS_SKIPPED",
        `Job ${emailJobId} was already SENT (messageId: ${current.messageId}). Skipping duplicate send.`,
        {
          emailJobId,
          sentAt: current.sentAt,
          messageId: current.messageId,
        },
      );
      return {
        emailJobId,
        success: true,
        messageId: current.messageId || "already-sent",
      };
    }

    if (current.status === EmailStatus.PROCESSING) {
      logger.warn("STATUS_SKIPPED", `Job ${emailJobId} is already processing`, {
        emailJobId,
      });
      return { emailJobId, success: true, messageId: "already-processing" };
    }

    logger.warn(
      "STATUS_SKIPPED",
      `Job ${emailJobId} is currently in status ${current.status}. Skipping.`,
      { emailJobId, status: current.status },
    );
    return {
      emailJobId,
      success: false,
      error: `Invalid status for send: ${current.status}`,
    };
  }

  logger.info(
    "STATUS_VERIFIED",
    `Atomic transition verified for job ${emailJobId}. Proceeding with delivery.`,
    {
      emailJobId,
    },
  );

  const emailJob = await prisma.emailJob.findUnique({
    where: { id: emailJobId },
    include: {
      sender: true,
      campaign: true,
    },
  });

  if (!emailJob || !emailJob.sender) {
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: EmailStatus.FAILED,
        failureReason: "Missing email job record or associated sender",
      },
    });

    logger.error(
      "EMAIL_FAILED_PERMANENT",
      `EmailJob or Sender missing for ID ${emailJobId}`,
      {
        emailJobId,
      },
    );
    return {
      emailJobId,
      success: false,
      error: "Missing sender configuration",
    };
  }

  // 4. CHECK & CONSUME DISTRIBUTED HOURLY RATE LIMIT (REDIS)
  // Evaluates hourly quota per sender across all workers and instances.
  // Respects campaign-specific hourlyLimit overrides from PostgreSQL, falling back to MAX_EMAILS_PER_HOUR_PER_SENDER.
  const effectiveHourlyLimit =
    emailJob.campaign?.hourlyLimit && emailJob.campaign.hourlyLimit > 0
      ? emailJob.campaign.hourlyLimit
      : config.maxEmailsPerHour;

  const rateLimitResult = await consumeHourlyRateLimit({
    senderId: emailJob.senderId,
    limit: effectiveHourlyLimit,
  });

  if (!rateLimitResult.storageAvailable) {
    const retryAt = new Date(Date.now() + 30_000);
    await deferEmailJob(
      emailJobId,
      retryAt,
      "Redis is unavailable; retrying distributed rate-limit check",
      "redis-retry",
    );
    await emailSearchService.indexEmailJobs([
      toSearchDocument(emailJob, emailJob.sender.email, EmailStatus.RESCHEDULED, retryAt),
    ]);
    logger.warn("RATE_LIMIT_DEFERRED", "Redis unavailable; deferring email job", {
      emailJobId,
      retryAt: retryAt.toISOString(),
    });
    return { emailJobId, success: true, messageId: `deferred-until-${retryAt.toISOString()}` };
  }

  if (!rateLimitResult.allowed) {
    // The hourly delay prevents a hot reschedule loop while preserving the job.
    const nextWindowTime = rateLimitResult.nextWindowStart;
    const delayMs = rateLimitResult.delayUntilNextWindowMs;

    logger.warn(
      "RATE_LIMIT_EXCEEDED",
      `Sender ${emailJob.sender.email} reached hourly limit (${rateLimitResult.currentUsage}/${effectiveHourlyLimit}). Rescheduling job ${emailJobId} to next window at ${nextWindowTime.toISOString()} (${Math.round(delayMs / 1000)}s delay)`,
      {
        emailJobId,
        senderId: emailJob.senderId,
        currentUsage: rateLimitResult.currentUsage,
        limit: effectiveHourlyLimit,
        hourWindow: rateLimitResult.hourWindow,
        nextWindowStart: nextWindowTime.toISOString(),
        delayMs,
        rescheduleCount: emailJob.rescheduleCount + 1,
      },
    );

    // Atomically update PostgreSQL state: status -> RESCHEDULED, new scheduledAt
    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: {
        status: EmailStatus.RESCHEDULED,
        scheduledAt: nextWindowTime,
        rescheduleCount: { increment: 1 },
        failureReason: `Hourly rate limit reached (${rateLimitResult.currentUsage}/${effectiveHourlyLimit}). Rescheduled to ${nextWindowTime.toISOString()}`,
      },
    });

    // Add delayed job to BullMQ for the next window
    const newBullJob = await scheduleEmailJob({
      emailJobId,
      scheduledAt: nextWindowTime,
      overrideDelayMs: delayMs,
      customJobOptions: {
        jobId: `${emailJobId}-ratelimit-${nextWindowTime.getTime()}`,
      },
    });

    await prisma.emailJob.update({
      where: { id: emailJobId },
      data: { bullJobId: String(newBullJob.id) },
    });

    await emailSearchService.indexEmailJobs([
      toSearchDocument(emailJob, emailJob.sender.email, EmailStatus.RESCHEDULED, nextWindowTime),
    ]);

    await notifySlackRateLimit({
      userId: emailJob.userId,
      senderId: emailJob.senderId,
      senderEmail: emailJob.sender.email,
      limit: effectiveHourlyLimit,
      emailJobId,
      hourWindow: rateLimitResult.hourWindow,
      nextWindow: nextWindowTime,
    });

    return {
      emailJobId,
      success: true,
      messageId: `rescheduled-rate-limit-until-${nextWindowTime.toISOString()}`,
    };
  }

  // 5. COORDINATE DISTRIBUTED MINIMUM SEND DELAY (REDIS)
  // Ensures that across ALL concurrent workers and processes, emails from this sender
  // are spaced by at least config.minEmailDelayMs.
  const minDelayMs = config.minEmailDelayMs;
  if (minDelayMs > 0) {
    const delayCoordination = await coordinateSendDelay({
      senderId: emailJob.senderId,
      minDelayMs,
    });

    if (!delayCoordination.available) {
      await decrementHourlyRateLimit(emailJob.senderId, rateLimitResult.hourWindow);
      const retryAt = new Date(Date.now() + 30_000);
      await deferEmailJob(
        emailJobId,
        retryAt,
        "Redis is unavailable; retrying distributed delay reservation",
        "delay-retry",
      );
      await emailSearchService.indexEmailJobs([
        toSearchDocument(emailJob, emailJob.sender.email, EmailStatus.RESCHEDULED, retryAt),
      ]);
      logger.warn("DELAY_DEFERRED", "Redis unavailable; deferring email job", {
        emailJobId,
        retryAt: retryAt.toISOString(),
      });
      return { emailJobId, success: true, messageId: `deferred-until-${retryAt.toISOString()}` };
    }

    if (delayCoordination.waitMs > 0) {
      const MAX_INLINE_WAIT_MS = 10000; // 10 seconds inline waiting threshold

      if (delayCoordination.waitMs > MAX_INLINE_WAIT_MS) {
        // Delay exceeds inline tolerance; reschedule to BullMQ so this worker concurrency
        // slot is immediately freed to process emails for other senders
        logger.info(
          "DELAY_RESCHEDULED",
          `Wait time of ${delayCoordination.waitMs}ms exceeds inline threshold (${MAX_INLINE_WAIT_MS}ms). Rescheduling emailJob ${emailJobId} to BullMQ.`,
          {
            emailJobId,
            senderId: emailJob.senderId,
            waitMs: delayCoordination.waitMs,
            scheduledSendTime: delayCoordination.scheduledSendTime,
          },
        );

        await decrementHourlyRateLimit(emailJob.senderId, rateLimitResult.hourWindow);
        await prisma.emailJob.update({
          where: { id: emailJobId },
          data: {
            status: EmailStatus.RESCHEDULED,
            scheduledAt: new Date(delayCoordination.scheduledSendTime),
            failureReason: `Paced by distributed minimum delay coordinator (${delayCoordination.waitMs}ms)`,
          },
        });

        const newBullJob = await scheduleEmailJob({
          emailJobId,
          scheduledAt: new Date(delayCoordination.scheduledSendTime),
          overrideDelayMs: delayCoordination.waitMs,
          customJobOptions: {
            jobId: `${emailJobId}-delay-${delayCoordination.scheduledSendTime}`,
          },
        });

        await prisma.emailJob.update({
          where: { id: emailJobId },
          data: { bullJobId: newBullJob.id },
        });

        await emailSearchService.indexEmailJobs([
          toSearchDocument(
            emailJob,
            emailJob.sender.email,
            EmailStatus.RESCHEDULED,
            new Date(delayCoordination.scheduledSendTime),
          ),
        ]);

        return {
          emailJobId,
          success: true,
          messageId: `rescheduled-delay-${delayCoordination.waitMs}ms`,
        };
      }

      // Normal inline pacing: wait asynchronously for the reserved millisecond
      logger.info(
        "DELAY_PACING",
        `Pacing delivery for sender ${emailJob.sender.email}: waiting ${delayCoordination.waitMs}ms before SMTP send`,
        {
          emailJobId,
          senderId: emailJob.senderId,
          waitMs: delayCoordination.waitMs,
          scheduledSendTime: delayCoordination.scheduledSendTime,
        },
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delayCoordination.waitMs),
      );
    }
  }

  // 5. Send email via Ethereal SMTP
  try {
    logger.info(
      "EMAIL_SENDING",
      `Dispatching email to ${emailJob.recipient} via Ethereal SMTP`,
      {
        emailJobId,
        recipient: emailJob.recipient,
        subject: emailJob.subject,
      },
    );

    const sendResult = await etherealSmtpService.sendEmail({
      fromName: emailJob.sender.displayName,
      fromEmail: emailJob.sender.email,
      to: emailJob.recipient,
      subject: emailJob.subject,
      html: emailJob.body,
      etherealCredentials: {
        host: emailJob.sender.etherealHost,
        port: emailJob.sender.etherealPort,
        user: emailJob.sender.etherealUser,
        password: emailJob.sender.etherealPassword,
      },
    });

    const latencyMs = Date.now() - startTime;

    // 5. Update PostgreSQL state: Mark as SENT and record message metadata
    await prisma.$transaction(async (tx) => {
      await tx.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: EmailStatus.SENT,
          sentAt: new Date(),
          messageId: sendResult.messageId,
          etherealPreviewUrl: sendResult.previewUrl,
          failureReason: null,
        },
      });

      if (emailJob.campaignId) {
        const campaign = await tx.campaign.update({
          where: { id: emailJob.campaignId },
          data: {
            sentEmails: { increment: 1 },
          },
        });

        // Mark campaign COMPLETED if all emails concluded
        if (
          campaign.sentEmails + campaign.failedEmails >=
          campaign.totalEmails
        ) {
          await tx.campaign.update({
            where: { id: emailJob.campaignId },
            data: { status: CampaignStatus.COMPLETED },
          });
        }
      }
    }, { timeout: 15000, maxWait: 10000 });

    await emailSearchService.indexEmailJobs([
      toSearchDocument(
        emailJob,
        emailJob.sender.email,
        EmailStatus.SENT,
        emailJob.scheduledAt,
        new Date(),
      ),
    ]);

    logger.info(
      "EMAIL_SENT",
      `Successfully delivered email to ${emailJob.recipient}`,
      {
        emailJobId,
        recipient: emailJob.recipient,
        messageId: sendResult.messageId,
        previewUrl: sendResult.previewUrl,
        latencyMs,
      },
    );

    return {
      emailJobId,
      success: true,
      messageId: sendResult.messageId,
    };
  } catch (error: unknown) {
    // Roll back consumed hourly quota so the failed delivery does not penalize the sender
    if (emailJob?.senderId && rateLimitResult?.hourWindow) {
      await decrementHourlyRateLimit(
        emailJob.senderId,
        rateLimitResult.hourWindow,
      );
    }

    const isTransient = etherealSmtpService.isTransientError(error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown SMTP transmission error";
    const maxAttempts = job.opts.attempts || 3;
    const isLastAttempt = job.attemptsMade + 1 >= maxAttempts;

    if (isTransient && !isLastAttempt) {
      // Revert status to SCHEDULED so BullMQ backoff retry can claim it cleanly on next attempt
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: EmailStatus.SCHEDULED,
          retryCount: { increment: 1 },
          failureReason: `Transient error (attempt ${job.attemptsMade + 1}/${maxAttempts}): ${errorMessage}`,
        },
      });

      await emailSearchService.indexEmailJobs([
        toSearchDocument(
          emailJob,
          emailJob.sender.email,
          EmailStatus.SCHEDULED,
          emailJob.scheduledAt,
        ),
      ]);

      logger.warn(
        "EMAIL_FAILED_TRANSIENT",
        `Transient SMTP failure, will retry with backoff: ${errorMessage}`,
        {
          emailJobId,
          attempt: job.attemptsMade + 1,
          maxAttempts,
        },
      );

      // Throw error to BullMQ to activate exponential backoff
      throw new Error(errorMessage);
    }

    // Permanent failure or max retries exhausted
    await prisma.$transaction(async (tx) => {
      await tx.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: EmailStatus.FAILED,
          failureReason: errorMessage,
        },
      });

      if (emailJob.campaignId) {
        const campaign = await tx.campaign.update({
          where: { id: emailJob.campaignId },
          data: {
            failedEmails: { increment: 1 },
          },
        });

        if (
          campaign.sentEmails + campaign.failedEmails >=
          campaign.totalEmails
        ) {
          await tx.campaign.update({
            where: { id: emailJob.campaignId },
            data: { status: CampaignStatus.COMPLETED },
          });
        }
      }
    }, { timeout: 15000, maxWait: 10000 });

    await emailSearchService.indexEmailJobs([
      toSearchDocument(
        emailJob,
        emailJob.sender.email,
        EmailStatus.FAILED,
        emailJob.scheduledAt,
      ),
    ]);

    logger.error(
      "EMAIL_FAILED_PERMANENT",
      `Permanent delivery failure for job ${emailJobId}: ${errorMessage}`,
      {
        emailJobId,
        recipient: emailJob.recipient,
        error: errorMessage,
        attempts: job.attemptsMade + 1,
      },
    );

    return {
      emailJobId,
      success: false,
      error: errorMessage,
    };
  }
}
