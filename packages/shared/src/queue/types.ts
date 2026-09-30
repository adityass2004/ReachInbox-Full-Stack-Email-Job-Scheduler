/**
 * Typed job payload for the BullMQ email-send queue.
 *
 * ARCHITECTURAL RULE:
 * This payload intentionally contains ONLY the stable database identifier (emailJobId)
 * and optional idempotency metadata. It must NEVER contain the full database record.
 * PostgreSQL is the authoritative source of truth; BullMQ is solely the execution
 * and delay trigger mechanism. When the worker process picks up this job, it fetches
 * the latest record state directly from PostgreSQL.
 */
export interface EmailJobData {
  emailJobId: string;
  idempotencyKey?: string;
}

/**
 * Return result structure recorded by BullMQ upon job completion.
 */
export interface EmailJobResult {
  emailJobId: string;
  success: boolean;
  messageId?: string;
  rescheduled?: boolean;
  rescheduledTo?: string;
  error?: string;
}
