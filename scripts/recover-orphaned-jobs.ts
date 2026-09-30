#!/usr/bin/env node

/**
 * ReachInbox Email Job Scheduler - Orphan Job Recovery & Reconciliation CLI
 * Audits and reconciles PostgreSQL SCHEDULED emails with BullMQ queue states.
 * Reclaims orphaned or interrupted jobs without double-sending.
 */

import process from "node:process";
import {
  runRecoveryCheck,
  disconnectDatabase,
  closeEmailQueue,
} from "@reachinbox/shared";

async function main() {
  console.log("====================================================");
  console.log("  ReachInbox - Orphan Job Recovery & Queue Reconciler");
  console.log("====================================================");
  console.log("Starting reconciliation scan against PostgreSQL...");

  const startTime = Date.now();
  try {
    const report = await runRecoveryCheck({
      stuckTimeoutMs: 3 * 60 * 1000, // 3 minutes timeout for stuck processing jobs
      maxRetries: 3,
    });

    const elapsed = Date.now() - startTime;
    console.log(`\nReconciliation completed in ${elapsed}ms:`);
    console.log(`  - Reconciled scheduled jobs:    ${report.reconciledScheduledJobs}`);
    console.log(`  - Recovered stuck worker jobs:  ${report.recoveredStuckProcessingJobs}`);
    console.log(`  - Failed / exhausted jobs:      ${report.failedStuckJobs}`);

    if (report.errors.length > 0) {
      console.warn("\nEncountered warnings/errors during recovery:");
      for (const error of report.errors) {
        console.warn(`  ! ${error}`);
      }
    } else {
      console.log("\nQueue and database are fully synchronized.");
    }
  } catch (error) {
    console.error("Fatal error during recovery scan:", error);
    process.exit(1);
  } finally {
    await closeEmailQueue();
    await disconnectDatabase();
  }
}

void main();
