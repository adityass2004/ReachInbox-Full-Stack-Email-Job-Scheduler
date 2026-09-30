import { prisma, EmailStatus, CampaignStatus } from "../db/index.js";
import {
  getEmailQueue,
  calculateDelayMs,
  scheduleEmailJob,
} from "./email-queue.js";

export interface RecoveryReport {
  reconciledScheduledJobs: number;
  recoveredStuckProcessingJobs: number;
  failedStuckJobs: number;
  errors: string[];
}

/**
 * Recovers orphaned and stuck email jobs after service or Redis restarts.
 * Enforces PostgreSQL as the single authoritative source of truth.
 */
export async function runRecoveryCheck(options?: {
  stuckTimeoutMs?: number;
  maxRetries?: number;
}): Promise<RecoveryReport> {
  const stuckTimeoutMs = options?.stuckTimeoutMs ?? 5 * 60 * 1000; // 5 minutes
  const maxRetries = options?.maxRetries ?? 3;

  const report: RecoveryReport = {
    reconciledScheduledJobs: 0,
    recoveredStuckProcessingJobs: 0,
    failedStuckJobs: 0,
    errors: [],
  };

  try {
    // 1. RECOVER ORPHANED SCHEDULED JOBS
    // Jobs that exist in PostgreSQL as SCHEDULED/RESCHEDULED but are missing from BullMQ (e.g. Redis restart)
    let queue: ReturnType<typeof getEmailQueue> | undefined;
    const getPendingJobs = (cursor?: string) =>
      prisma.emailJob.findMany({
        where: {
          status: { in: [EmailStatus.SCHEDULED, EmailStatus.RESCHEDULED] },
        },
        select: {
          id: true,
          scheduledAt: true,
          idempotencyKey: true,
          bullJobId: true,
        },
        orderBy: { id: "asc" },
        take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    let pendingCursor: string | undefined;
    let pendingJobs = await getPendingJobs();
    while (pendingJobs.length > 0) {
      queue ??= getEmailQueue();
      pendingCursor = pendingJobs[pendingJobs.length - 1].id;

      for (const job of pendingJobs) {
        try {
          const existingBullJob = await queue.getJob(job.bullJobId ?? job.id);

          if (existingBullJob) {
            if (job.bullJobId !== String(existingBullJob.id)) {
              await prisma.emailJob.update({
                where: { id: job.id },
                data: { bullJobId: String(existingBullJob.id) },
              });
            }
            continue;
          }

          const delay = calculateDelayMs(job.scheduledAt);
          const bullJob = await scheduleEmailJob({
            emailJobId: job.id,
            scheduledAt: job.scheduledAt,
            idempotencyKey: job.idempotencyKey,
            overrideDelayMs: delay,
          });

          await prisma.emailJob.update({
            where: { id: job.id },
            data: { bullJobId: String(bullJob.id) },
          });
          report.reconciledScheduledJobs++;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          report.errors.push(
            `Failed to reconcile scheduled job ${job.id}: ${msg}`,
          );
        }
      }
      pendingJobs = await getPendingJobs(pendingCursor);
    }

    // 2. RECOVER STUCK PROCESSING JOBS
    // Jobs left in PROCESSING state because a worker crashed mid-flight
    const stuckThreshold = new Date(Date.now() - stuckTimeoutMs);
    const getStuckJobs = (cursor?: string) =>
      prisma.emailJob.findMany({
        where: {
          status: EmailStatus.PROCESSING,
          updatedAt: { lt: stuckThreshold },
        },
        include: { campaign: true },
        orderBy: { id: "asc" },
        take: 500,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
    let stuckCursor: string | undefined;
    let stuckJobs = await getStuckJobs();
    while (stuckJobs.length > 0) {
      stuckCursor = stuckJobs[stuckJobs.length - 1].id;

      for (const job of stuckJobs) {
        try {
          queue ??= getEmailQueue();
          const bullJob = await queue.getJob(job.bullJobId ?? job.id);
          if (bullJob && (await bullJob.getState()) === "active") continue;

          if (job.messageId) {
            const recovered = await prisma.emailJob.updateMany({
              where: {
                id: job.id,
                status: EmailStatus.PROCESSING,
                messageId: job.messageId,
                updatedAt: { lt: stuckThreshold },
              },
              data: {
                status: EmailStatus.SENT,
                sentAt: job.sentAt ?? new Date(),
              },
            });
            if (recovered.count === 1) report.recoveredStuckProcessingJobs++;
            continue;
          }

          if (job.retryCount < maxRetries) {
            const reclaimed = await prisma.emailJob.updateMany({
              where: {
                id: job.id,
                status: EmailStatus.PROCESSING,
                messageId: null,
                updatedAt: { lt: stuckThreshold },
              },
              data: {
                status: EmailStatus.SCHEDULED,
                scheduledAt: new Date(),
                retryCount: { increment: 1 },
                failureReason: `Recovered from crashed worker process (retry ${job.retryCount + 1}/${maxRetries})`,
              },
            });
            if (reclaimed.count !== 1) continue;

            const retryJob = await scheduleEmailJob({
              emailJobId: job.id,
              scheduledAt: new Date(),
              idempotencyKey: job.idempotencyKey,
              overrideDelayMs: 0,
            });
            await prisma.emailJob.update({
              where: { id: job.id },
              data: { bullJobId: String(retryJob.id) },
            });
            report.recoveredStuckProcessingJobs++;
          } else {
            const failedCount = await prisma.$transaction(async (tx) => {
              const failed = await tx.emailJob.updateMany({
                where: {
                  id: job.id,
                  status: EmailStatus.PROCESSING,
                  messageId: null,
                  updatedAt: { lt: stuckThreshold },
                },
                data: {
                  status: EmailStatus.FAILED,
                  failureReason:
                    "Worker crashed mid-execution and maximum recovery retries exceeded",
                },
              });
              if (failed.count !== 1 || !job.campaignId) return failed.count;

              const updatedCampaign = await tx.campaign.update({
                where: { id: job.campaignId },
                data: { failedEmails: { increment: 1 } },
              });
              if (
                updatedCampaign.sentEmails + updatedCampaign.failedEmails >=
                updatedCampaign.totalEmails
              ) {
                await tx.campaign.update({
                  where: { id: job.campaignId },
                  data: { status: CampaignStatus.COMPLETED },
                });
              }
              return failed.count;
            });
            if (failedCount === 1) report.failedStuckJobs++;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          report.errors.push(`Failed to recover stuck job ${job.id}: ${msg}`);
        }
      }
      stuckJobs = await getStuckJobs(stuckCursor);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    report.errors.push(`Recovery scan general error: ${msg}`);
  }

  return report;
}
