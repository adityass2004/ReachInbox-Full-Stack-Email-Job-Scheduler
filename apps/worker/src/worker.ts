import { Worker } from "bullmq";
import {
  QUEUE_NAMES,
  EmailJobData,
  EmailJobResult,
  getRedisConnectionOptions,
} from "@reachinbox/shared";
import { config } from "./config/env.js";
import { processEmailJob } from "./processors/email-send.processor.js";
import { logger } from "./logger.js";

let workerInstance: Worker<EmailJobData, EmailJobResult, string> | null = null;

/**
 * Initializes and starts the BullMQ worker for the email-send queue.
 */
export function startEmailWorker(): Worker<
  EmailJobData,
  EmailJobResult,
  string
> {
  if (workerInstance) {
    return workerInstance;
  }

  const connection = getRedisConnectionOptions();

  workerInstance = new Worker<EmailJobData, EmailJobResult, string>(
    QUEUE_NAMES.EMAIL_SEND,
    async (job) => processEmailJob(job),
    {
      connection,
      concurrency: config.concurrency,
      // Prevents worker stall warnings on high throughput
      lockDuration: 30000,
    },
  );

  workerInstance.on("ready", () => {
    logger.info("WORKER_READY", `BullMQ worker connected and ready for jobs`, {
      queue: QUEUE_NAMES.EMAIL_SEND,
      concurrency: config.concurrency,
    });
  });

  workerInstance.on("completed", (job, result) => {
    logger.info(
      "WORKER_JOB_COMPLETED",
      `Job ${job.id} completed successfully`,
      {
        bullJobId: job.id,
        emailJobId: result.emailJobId,
        messageId: result.messageId,
      },
    );
  });

  workerInstance.on("failed", (job, error) => {
    logger.error(
      "WORKER_JOB_FAILED",
      `Job ${job?.id} failed: ${error.message}`,
      {
        bullJobId: job?.id,
        emailJobId: job?.data?.emailJobId,
        error: error.message,
      },
    );
  });

  workerInstance.on("error", (error) => {
    logger.error("WORKER_ERROR", `Queue error in worker: ${error.message}`, {
      error: error.message,
    });
  });

  return workerInstance;
}

/**
 * Gracefully shuts down the worker, waiting for in-flight jobs to complete.
 */
export async function closeEmailWorker(): Promise<void> {
  if (workerInstance) {
    logger.info("WORKER_CLOSING", "Pausing and closing BullMQ worker...");
    await workerInstance.close();
    workerInstance = null;
    logger.info("WORKER_CLOSED", "BullMQ worker shut down cleanly.");
  }
}
