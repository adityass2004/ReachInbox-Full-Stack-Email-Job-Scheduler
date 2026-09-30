export const QUEUE_NAMES = {
  EMAIL_SEND: "email-send",
} as const;

export const JOB_NAMES = {
  SEND_EMAIL: "send-email",
} as const;

export const DEFAULT_CONFIG = {
  MIN_EMAIL_DELAY_MS: 2000,
  MAX_EMAILS_PER_HOUR_PER_SENDER: 200,
  WORKER_CONCURRENCY: 5,
  MAX_RETRY_ATTEMPTS: 3,
} as const;

import { EmailStatus } from "@prisma/client";

export { EmailStatus };
export const EMAIL_STATUS = EmailStatus;
