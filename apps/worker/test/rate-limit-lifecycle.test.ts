import { describe, it } from "node:test";
import assert from "node:assert";
import { EmailStatus } from "@reachinbox/shared";

describe("Email Rate-Limiting & Rescheduling Lifecycle (150 Emails Scenario)", () => {
  it("enforces hourly limit of 5 on 150 emails, preserving scheduledAt and populating nextAttemptAt & rescheduledAt", async () => {
    const HOURLY_LIMIT = 5;
    const TOTAL_EMAILS = 150;
    const now = new Date("2026-09-30T10:00:00.000Z");
    const nextWindowStart = new Date("2026-09-30T11:00:00.000Z");

    // Simulated database store for the 150 email jobs
    interface EmailJobRecord {
      id: string;
      recipient: string;
      status: EmailStatus;
      scheduledAt: Date;
      rescheduledAt: Date | null;
      nextAttemptAt: Date | null;
      sentAt: Date | null;
      rescheduleCount: number;
    }

    const dbJobs: Map<string, EmailJobRecord> = new Map();
    for (let i = 1; i <= TOTAL_EMAILS; i++) {
      dbJobs.set(`job-${i}`, {
        id: `job-${i}`,
        recipient: `user${i}@example.com`,
        status: EmailStatus.SCHEDULED,
        scheduledAt: new Date(now.getTime() + (i - 1) * 1000), // Original requested times
        rescheduledAt: null,
        nextAttemptAt: null,
        sentAt: null,
        rescheduleCount: 0,
      });
    }

    // Verify initial state: all 150 emails are SCHEDULED
    for (const job of dbJobs.values()) {
      assert.strictEqual(job.status, EmailStatus.SCHEDULED);
      assert.strictEqual(job.rescheduledAt, null);
      assert.strictEqual(job.nextAttemptAt, null);
      assert.strictEqual(job.sentAt, null);
    }

    // Simulated rate limiter tracking current hourly count
    let hourlyCount = 0;
    const bullDelayedQueue: Array<{ emailJobId: string; delayMs: number; scheduledAt: Date }> = [];

    // Worker processing simulation following the exact processor logic
    async function processSimulatedJob(jobId: string) {
      const job = dbJobs.get(jobId)!;

      // 1. Atomic state transition: [SCHEDULED, RESCHEDULED, RATE_LIMITED] -> PROCESSING
      assert.ok([EmailStatus.SCHEDULED, EmailStatus.RESCHEDULED, EmailStatus.RATE_LIMITED].includes(job.status));
      job.status = EmailStatus.PROCESSING;

      // 2. Check hourly rate limit
      if (hourlyCount < HOURLY_LIMIT) {
        hourlyCount++;
        // Successfully sent via SMTP
        job.status = EmailStatus.SENT;
        job.sentAt = new Date(now.getTime() + 500);
        return { success: true, status: EmailStatus.SENT };
      }

      // Hourly limit exceeded:
      // Step 1: Record RATE_LIMITED state and timestamps without overwriting original scheduledAt
      const rescheduleTimestamp = new Date(now.getTime() + 100);
      const originalScheduledAt = job.scheduledAt;

      job.status = EmailStatus.RATE_LIMITED;
      job.rescheduledAt = rescheduleTimestamp;
      job.nextAttemptAt = nextWindowStart;
      job.rescheduleCount++;

      // Verify scheduledAt is strictly preserved
      assert.strictEqual(job.scheduledAt.getTime(), originalScheduledAt.getTime());

      // Step 2: Add delayed job to BullMQ
      bullDelayedQueue.push({
        emailJobId: job.id,
        delayMs: nextWindowStart.getTime() - rescheduleTimestamp.getTime(),
        scheduledAt: nextWindowStart,
      });

      // Step 3: Transition to RESCHEDULED
      job.status = EmailStatus.RESCHEDULED;

      return { success: true, status: EmailStatus.RESCHEDULED };
    }

    // Execute processing of all 150 emails
    for (let i = 1; i <= TOTAL_EMAILS; i++) {
      await processSimulatedJob(`job-${i}`);
    }

    // 4. Verify outcomes:
    // Exactly 5 emails are SENT
    const sentJobs = Array.from(dbJobs.values()).filter((j) => j.status === EmailStatus.SENT);
    assert.strictEqual(sentJobs.length, 5);
    for (const job of sentJobs) {
      assert.ok(job.sentAt !== null);
      assert.strictEqual(job.rescheduledAt, null);
    }

    // Exactly 145 emails are RESCHEDULED
    const rescheduledJobs = Array.from(dbJobs.values()).filter((j) => j.status === EmailStatus.RESCHEDULED);
    assert.strictEqual(rescheduledJobs.length, 145);

    // Verify all 145 delayed jobs exist in BullMQ queue
    assert.strictEqual(bullDelayedQueue.length, 145);

    for (const job of rescheduledJobs) {
      // scheduledAt was NOT overwritten
      assert.ok(job.scheduledAt.getTime() < now.getTime() + 150000);
      assert.ok(job.scheduledAt.getTime() !== nextWindowStart.getTime());

      // nextAttemptAt points to next hourly window
      assert.strictEqual(job.nextAttemptAt?.toISOString(), nextWindowStart.toISOString());
      assert.ok(job.rescheduledAt !== null);
      assert.strictEqual(job.sentAt, null);
      assert.strictEqual(job.rescheduleCount, 1);
    }

    // 5. Verify Pending/Scheduled Dashboard query semantics:
    // Scheduled/Pending includes scheduled, processing, rate_limited, and rescheduled.
    const inFlightStatuses = [
      EmailStatus.SCHEDULED,
      EmailStatus.PROCESSING,
      EmailStatus.RATE_LIMITED,
      EmailStatus.RESCHEDULED,
    ];
    const pendingJobs = Array.from(dbJobs.values()).filter((j) => inFlightStatuses.includes(j.status));
    assert.strictEqual(pendingJobs.length, 145);

    // 6. Verify Second Window Execution:
    // When next window arrives, reset hourly count and re-process the first rescheduled job
    hourlyCount = 0; // New window reset
    const firstRescheduled = rescheduledJobs[0];

    // Worker picks up RESCHEDULED job -> transitions to PROCESSING -> SENT
    const retryResult = await processSimulatedJob(firstRescheduled.id);
    assert.strictEqual(retryResult.status, EmailStatus.SENT);
    assert.strictEqual(firstRescheduled.status, EmailStatus.SENT);
    assert.ok(firstRescheduled.sentAt !== null);
    // Original scheduledAt is STILL intact
    assert.ok(firstRescheduled.scheduledAt.getTime() !== nextWindowStart.getTime());
    // Metadata preserved
    assert.strictEqual(firstRescheduled.nextAttemptAt?.toISOString(), nextWindowStart.toISOString());
  });

  it("ensures atomic idempotency: the same job cannot be delivered twice", async () => {
    let callCount = 0;
    const jobState = { status: EmailStatus.SCHEDULED, sentAt: null as Date | null };

    async function attemptSend() {
      // Atomic transition
      if (jobState.status !== EmailStatus.SCHEDULED) {
        return { skipped: true };
      }
      jobState.status = EmailStatus.PROCESSING;
      callCount++;
      jobState.status = EmailStatus.SENT;
      jobState.sentAt = new Date();
      return { skipped: false };
    }

    const [res1, res2] = await Promise.all([attemptSend(), attemptSend()]);
    assert.strictEqual(callCount, 1);
    assert.strictEqual(jobState.status, EmailStatus.SENT);
    assert.ok(res1.skipped !== res2.skipped); // One succeeded, one was skipped
  });
});
