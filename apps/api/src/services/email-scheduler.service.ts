import { randomUUID } from 'node:crypto';
import {
  prisma,
  generateEmailIdempotencyKey,
  scheduleEmailJob,
  scheduleEmailJobsBulk,
  getEmailQueue,
  EmailStatus,
  CampaignStatus,
  EmailJob,
  Campaign,
  Prisma,
  emailSearchService,
  EmailSearchDocument,
} from '@reachinbox/shared';
import { ScheduleEmailInput } from '../validators/email.validator.js';
import { HttpError } from '../middleware/http-error.js';
import { config } from '../config/env.js';

export interface ScheduleBatchResult {
  campaign: Campaign;
  totalScheduled: number;
  emailJobs: Array<Pick<EmailJob, 'id' | 'recipient' | 'scheduledAt' | 'status' | 'bullJobId'>>;
  idempotentReplay?: boolean;
}

export class EmailSchedulerService {
  /**
   * Schedules a batch of emails across recipients with computed stagger delays.
   * Enforces transactional integrity, DB-level idempotency, and queue reconciliation.
   */
  async scheduleBatch(userId: string, input: ScheduleEmailInput): Promise<ScheduleBatchResult> {
    const {
      senderEmail,
      senderName,
      senderId,
      recipients,
      subject,
      body,
      startTime,
      delayBetweenEmailsMs,
      hourlyLimit,
    } = input;

    // 1. Resolve or create Sender for the user
    let sender;
    if (senderId) {
      sender = await prisma.sender.findFirst({
        where: { id: senderId, userId },
      });
      if (!sender) {
        throw new HttpError(404, 'SENDER_NOT_FOUND', 'Sender not found');
      }
      if (!sender.active) {
        throw new HttpError(409, 'SENDER_INACTIVE', 'Sender is inactive');
      }
    } else {
      sender = await prisma.sender.findFirst({
        where: { userId, email: senderEmail.toLowerCase().trim() },
      });
      if (sender && !sender.active) {
        throw new HttpError(409, 'SENDER_INACTIVE', 'Sender is inactive');
      }
    }

    if (!sender) {
      sender = await prisma.sender.create({
        data: {
          userId,
          email: senderEmail.toLowerCase().trim(),
          displayName: senderName || senderEmail.split('@')[0],
          etherealHost: process.env.ETHEREAL_HOST || 'smtp.ethereal.email',
          etherealPort: parseInt(process.env.ETHEREAL_PORT || '587', 10),
          etherealUser: process.env.ETHEREAL_USER || '',
          etherealPassword: process.env.ETHEREAL_PASSWORD || '',
          active: true,
        },
      });
    }

    const baseStartTime = startTime instanceof Date ? startTime : new Date(startTime);
    const effectiveHourlyLimit = hourlyLimit ?? config.maxEmailsPerHour;

    // 2. Pre-compute deterministic idempotency keys and pre-allocated UUIDs for all recipients in the batch
    const candidateJobs = recipients.map((recipient, index) => {
      const scheduledAt = new Date(baseStartTime.getTime() + index * delayBetweenEmailsMs);
      const idempotencyKey = generateEmailIdempotencyKey({
        userId,
        senderEmail: sender!.email,
        recipientEmail: recipient,
        subject,
        body,
        scheduledAt,
      });

      return {
        id: randomUUID(),
        recipient,
        scheduledAt,
        idempotencyKey,
      };
    });

    const candidateKeys = candidateJobs.map((j) => j.idempotencyKey);

    // 3. Check for existing jobs matching these idempotency keys (Client Retry / Repeated Request)
    const existingJobs = await prisma.emailJob.findMany({
      where: {
        userId,
        idempotencyKey: { in: candidateKeys },
      },
      include: { campaign: true },
    });

    // If ALL recipients were already scheduled with identical keys, return idempotent replay
    if (existingJobs.length === recipients.length && existingJobs[0]?.campaign) {
      const campaign = existingJobs[0].campaign;

      // Ensure BullMQ jobs exist in Redis (in case Redis was flushed)
      const queue = getEmailQueue();
      for (const job of existingJobs) {
        if (job.status === EmailStatus.SCHEDULED || job.status === EmailStatus.RESCHEDULED) {
          try {
            const existingBullJob = await queue.getJob(job.bullJobId ?? job.id);
            const bullJob = existingBullJob ?? await scheduleEmailJob({
              emailJobId: job.id,
              scheduledAt: job.scheduledAt,
              idempotencyKey: job.idempotencyKey,
            });
            await prisma.emailJob.update({
              where: { id: job.id },
              data: { bullJobId: String(bullJob.id) },
            });
          } catch {
            throw new HttpError(
              503,
              'QUEUE_UNAVAILABLE',
              'The email queue is temporarily unavailable; retry this request',
            );
          }
        }
      }

      return {
        campaign,
        totalScheduled: existingJobs.length,
        idempotentReplay: true,
        emailJobs: existingJobs.map((job) => ({
          id: job.id,
          recipient: job.recipient,
          scheduledAt: job.scheduledAt,
          status: job.status,
          bullJobId: job.bullJobId,
        })),
      };
    }

    // Filter out any specific jobs that already exist to prevent duplicate insertion
    const existingKeySet = new Set(existingJobs.map((j) => j.idempotencyKey));
    const newCandidateJobs = candidateJobs.filter((j) => !existingKeySet.has(j.idempotencyKey));

    // 4. PostgreSQL Transaction: Create Campaign and EmailJob rows in high-efficiency chunks
    const { campaign, createdJobs } = await prisma.$transaction(async (tx) => {
      const newCampaign = await tx.campaign.create({
        data: {
          userId,
          subject,
          body,
          startTime: baseStartTime,
          delayMs: delayBetweenEmailsMs,
          hourlyLimit: effectiveHourlyLimit,
          status: CampaignStatus.SCHEDULED,
          totalEmails: newCandidateJobs.length,
        },
      });

      const DB_CHUNK_SIZE = 1000;
      const jobRows = newCandidateJobs.map((item) => ({
        id: item.id,
        campaignId: newCampaign.id,
        senderId: sender!.id,
        userId,
        recipient: item.recipient,
        subject,
        body,
        scheduledAt: item.scheduledAt,
        status: EmailStatus.SCHEDULED,
        idempotencyKey: item.idempotencyKey,
      }));

      for (let i = 0; i < jobRows.length; i += DB_CHUNK_SIZE) {
        const chunk = jobRows.slice(i, i + DB_CHUNK_SIZE);
        await tx.emailJob.createMany({
          data: chunk,
        });
      }

      return { campaign: newCampaign, createdJobs: jobRows };
    });

    await emailSearchService.indexEmailJobs(
      createdJobs.map((job): EmailSearchDocument => ({
        emailJobId: job.id,
        userId: job.userId,
        recipient: job.recipient,
        sender: sender!.email,
        subject: job.subject,
        status: job.status,
        campaignId: job.campaignId,
        scheduledAt: job.scheduledAt.toISOString(),
        sentAt: null,
      })),
    );

    // 5. BullMQ Bulk Enqueue via addBulk API
    try {
      const bullJobs = await scheduleEmailJobsBulk(
        createdJobs.map((job) => ({
          emailJobId: job.id,
          scheduledAt: job.scheduledAt,
          idempotencyKey: job.idempotencyKey,
        })),
        1000,
      );

      const idToBullId = new Map(
        bullJobs.map((b: { data: { emailJobId: string }; id?: string | number }) => [
          String(b.data.emailJobId),
          String(b.id),
        ]),
      );
      const jobsWithBullId = createdJobs.map((job) => ({
        ...job,
        bullJobId: idToBullId.get(job.id) || job.id,
      }));

      // Reconcile bullJobId in PostgreSQL in chunks
      const UPDATE_CHUNK_SIZE = 500;
      for (let i = 0; i < jobsWithBullId.length; i += UPDATE_CHUNK_SIZE) {
        const chunk = jobsWithBullId.slice(i, i + UPDATE_CHUNK_SIZE);
        await prisma.$transaction(
          chunk.map((job) =>
            prisma.emailJob.update({
              where: { id: job.id },
              data: { bullJobId: String(job.bullJobId) },
            }),
          ),
        );
      }

      const allJobs = [...existingJobs, ...jobsWithBullId];

      return {
        campaign,
        totalScheduled: allJobs.length,
        emailJobs: allJobs.map((job) => ({
          id: job.id,
          recipient: job.recipient,
          scheduledAt: job.scheduledAt,
          status: job.status,
          bullJobId: job.bullJobId ? String(job.bullJobId) : null,
        })),
      };
    } catch {
      throw new HttpError(
        503,
        'QUEUE_UNAVAILABLE',
        'The email queue is temporarily unavailable; scheduled emails remain persisted for recovery',
      );
    }
  }

  /**
   * Retrieves a paginated list of scheduled emails for a user.
   */
  async getScheduledEmails(
    userId: string,
    params: {
      page: number;
      limit: number;
      senderId?: string;
      campaignId?: string;
      search?: string;
    },
  ) {
    const { page, limit, senderId, campaignId, search } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.EmailJobWhereInput = {
      userId,
      status: {
        in: [EmailStatus.SCHEDULED, EmailStatus.RESCHEDULED],
      },
    };

    if (senderId) where.senderId = senderId;
    if (campaignId) where.campaignId = campaignId;
    if (search) {
      where.OR = [
        { recipient: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.emailJob.count({ where }),
      prisma.emailJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              displayName: true,
            },
          },
          campaign: {
            select: {
              id: true,
              subject: true,
            },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves single email job details by ID with ownership verification.
   */
  async getEmailJobById(id: string, userId: string) {
    const emailJob = await prisma.emailJob.findFirst({
      where: { id, userId },
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            displayName: true,
            active: true,
          },
        },
        campaign: {
          select: {
            id: true,
            subject: true,
            delayMs: true,
            hourlyLimit: true,
            status: true,
          },
        },
      },
    });

    return emailJob;
  }

  async searchEmailJobs(
    userId: string,
    params: { q: string; status?: EmailStatus; statuses?: EmailStatus[]; page: number; limit: number },
  ) {
    try {
      const esResult = await emailSearchService.searchEmailJobs(userId, params);
      if (esResult) {
        return esResult;
      }
    } catch (error) {
      console.warn('[Search] Elasticsearch unavailable, falling back to database:', error);
    }

    // Authoritative fallback: Query PostgreSQL directly
    const skip = (params.page - 1) * params.limit;
    const where: Prisma.EmailJobWhereInput = { userId };

    if (params.status) {
      where.status = params.status;
    } else if (params.statuses && params.statuses.length > 0) {
      where.status = { in: params.statuses };
    }

    const trimmedQuery = params.q?.trim();
    if (trimmedQuery) {
      where.OR = [
        { recipient: { contains: trimmedQuery, mode: 'insensitive' } },
        { subject: { contains: trimmedQuery, mode: 'insensitive' } },
      ];
    }

    const [total, jobs] = await Promise.all([
      prisma.emailJob.count({ where }),
      prisma.emailJob.findMany({
        where,
        skip,
        take: params.limit,
        orderBy: { scheduledAt: 'desc' },
        include: {
          sender: {
            select: {
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      items: jobs.map((job) => ({
        emailJobId: job.id,
        userId: job.userId,
        recipient: job.recipient,
        sender: job.sender.email,
        subject: job.subject,
        status: job.status,
        campaignId: job.campaignId,
        scheduledAt: job.scheduledAt.toISOString(),
        sentAt: job.sentAt ? job.sentAt.toISOString() : null,
      })),
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit),
    };
  }
}

export const emailSchedulerService = new EmailSchedulerService();
