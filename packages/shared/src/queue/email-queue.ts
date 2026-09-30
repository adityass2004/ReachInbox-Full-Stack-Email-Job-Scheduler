import { Queue, Job, JobsOptions } from "bullmq";
import {
  QUEUE_NAMES,
  JOB_NAMES,
  DEFAULT_JOB_OPTIONS,
  getRedisConnectionOptions,
} from "./config.js";
import { EmailJobData, EmailJobResult } from "./types.js";

let emailQueueInstance: Queue<EmailJobData, EmailJobResult, string> | null =
  null;

/**
 * Calculates the millisecond delay between now and the target scheduled time.
 * Returns 0 if scheduled time is in the past or immediately due.
 */
export function calculateDelayMs(scheduledAt: Date | string): number {
  const targetTime = new Date(scheduledAt).getTime();
  const now = Date.now();
  return Math.max(0, targetTime - now);
}

/**
 * Returns the singleton BullMQ Queue instance for "email-send".
 */
export function getEmailQueue(): Queue<EmailJobData, EmailJobResult, string> {
  if (!emailQueueInstance) {
    const connection = getRedisConnectionOptions();

    emailQueueInstance = new Queue<EmailJobData, EmailJobResult, string>(
      QUEUE_NAMES.EMAIL_SEND,
      {
        connection,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      },
    );

    // Attach passive error listener to prevent unhandled EventEmitter errors during disconnects
    emailQueueInstance.on("error", (err) => {
      if (process.env.DEBUG_REDIS === "true") {
        console.warn("[BullMQ Queue Warning]:", err.message);
      }
    });
  }

  return emailQueueInstance;
}

export interface ScheduleEmailJobOptions {
  emailJobId: string;
  scheduledAt: Date | string;
  idempotencyKey?: string;
  priority?: number;
  overrideDelayMs?: number;
  customJobOptions?: Partial<JobsOptions>;
}

/**
 * Adds an email job to the BullMQ "email-send" queue with calculated delay.
 * Uses `jobId: emailJobId` to enforce queue-level deduplication.
 */
export async function scheduleEmailJob(
  options: ScheduleEmailJobOptions,
): Promise<Job<EmailJobData, EmailJobResult, string>> {
  const queue = getEmailQueue();
  const delay =
    options.overrideDelayMs ?? calculateDelayMs(options.scheduledAt);

  const jobData: EmailJobData = {
    emailJobId: options.emailJobId,
    idempotencyKey: options.idempotencyKey,
  };

  const jobOptions: JobsOptions = {
    ...DEFAULT_JOB_OPTIONS,
    // Use the database emailJobId as BullMQ jobId for natural queue-level deduplication
    jobId: options.emailJobId,
    delay,
    priority: options.priority,
    ...options.customJobOptions,
  };

  return await queue.add(JOB_NAMES.SEND_EMAIL, jobData, jobOptions);
}

/**
 * Adds multiple email jobs to the BullMQ "email-send" queue using BullMQ's addBulk API.
 * Optimized for large recipient batches (e.g. 5,000+ jobs) to avoid round-trip overhead.
 */
export async function scheduleEmailJobsBulk(
  jobs: ScheduleEmailJobOptions[],
  chunkSize = 1000,
): Promise<Job<EmailJobData, EmailJobResult, string>[]> {
  if (jobs.length === 0) return [];
  const queue = getEmailQueue();
  const results: Job<EmailJobData, EmailJobResult, string>[] = [];

  for (let i = 0; i < jobs.length; i += chunkSize) {
    const chunk = jobs.slice(i, i + chunkSize);
    const bulkPayload = chunk.map((options) => {
      const delay =
        options.overrideDelayMs ?? calculateDelayMs(options.scheduledAt);
      const jobData: EmailJobData = {
        emailJobId: options.emailJobId,
        idempotencyKey: options.idempotencyKey,
      };
      const jobOptions: JobsOptions = {
        ...DEFAULT_JOB_OPTIONS,
        jobId: options.emailJobId,
        delay,
        priority: options.priority,
        ...options.customJobOptions,
      };

      return {
        name: JOB_NAMES.SEND_EMAIL,
        data: jobData,
        opts: jobOptions,
      };
    });

    const added = await queue.addBulk(bulkPayload);
    results.push(...added);
  }

  return results;
}

/**
 * Gracefully closes the BullMQ email queue and frees resources.
 */
export async function closeEmailQueue(): Promise<void> {
  if (emailQueueInstance) {
    await emailQueueInstance.close();
    emailQueueInstance = null;
  }
}
