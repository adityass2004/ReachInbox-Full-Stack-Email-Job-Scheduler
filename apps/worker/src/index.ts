import http from "node:http";
import { disconnectDatabase, emailSearchService, runRecoveryCheck } from "@reachinbox/shared";
import { config } from "./config/env.js";
import { startEmailWorker, closeEmailWorker } from "./worker.js";
import { logger } from "./logger.js";

async function bootstrapWorker(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("====================================================");
  // eslint-disable-next-line no-console
  console.log(
    `[Worker Service] Starting ${config.serviceName} v${config.version}`,
  );
  // eslint-disable-next-line no-console
  console.log(`[Worker Service] Environment: ${config.nodeEnv}`);
  // eslint-disable-next-line no-console
  console.log(
    `[Worker Service] Redis URL: ${config.redisUrl.replace(/\/\/[^@]*@/, "//***@")}`,
  );
  // eslint-disable-next-line no-console
  console.log(`[Worker Service] Concurrency: ${config.concurrency}`);
  // eslint-disable-next-line no-console
  console.log(`[Worker Service] Min Email Delay: ${config.minEmailDelayMs}ms`);
  // eslint-disable-next-line no-console
  console.log(
    `[Worker Service] Max Emails/Hour/Sender: ${config.maxEmailsPerHour}`,
  );
  // eslint-disable-next-line no-console
  console.log("====================================================");

  // 1. Run Startup Recovery & Reconciliation Check
  // Re-queues any SCHEDULED jobs missing from Redis and recovers stuck PROCESSING jobs
  try {
    logger.info(
      "RECOVERY_STARTUP",
      "Executing startup reconciliation scan against PostgreSQL...",
    );
    const report = await runRecoveryCheck({
      stuckTimeoutMs: 3 * 60 * 1000, // 3 minutes timeout for stuck processing jobs
    });

    logger.info(
      "RECOVERY_STARTUP_COMPLETED",
      "Startup reconciliation scan complete",
      {
        reconciledScheduledJobs: report.reconciledScheduledJobs,
        recoveredStuckProcessingJobs: report.recoveredStuckProcessingJobs,
        failedStuckJobs: report.failedStuckJobs,
        errors: report.errors,
      },
    );
    if (report.errors.length > 0) {
      logger.warn("RECOVERY_STARTUP_ERRORS", "Some startup recovery items failed", {
        errors: report.errors,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(
      "RECOVERY_STARTUP_WARNING",
      `Startup recovery scan skipped or failed: ${msg}`,
    );
  }

  // 2. Start BullMQ Worker processing
  startEmailWorker();

  // 3. Periodic Background Watchdog (Every 2 minutes)
  // Ensures delayed jobs survive Redis flushes/restarts and cleans up stuck worker crashes
  const recoveryInterval = setInterval(async () => {
    try {
      const report = await runRecoveryCheck({ stuckTimeoutMs: 3 * 60 * 1000 });
      if (
        report.reconciledScheduledJobs > 0 ||
        report.recoveredStuckProcessingJobs > 0 ||
        report.errors.length > 0
      ) {
        logger.info("PERIODIC_RECOVERY", "Periodic recovery scan completed", {
          reconciledScheduledJobs: report.reconciledScheduledJobs,
          recoveredStuckProcessingJobs: report.recoveredStuckProcessingJobs,
          errors: report.errors,
        });
      }
    } catch (error) {
      logger.warn("PERIODIC_RECOVERY_ERROR", "Periodic recovery scan failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, 120000);

  // 4. Heartbeat logging for health monitoring in background container environments (e.g. Cloud Run)
  const heartbeatInterval = setInterval(() => {
    logger.info("HEARTBEAT", "Worker process is healthy and active", {
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      concurrency: config.concurrency,
    });
  }, 60000);

  // 5. Cloud Run / Container HTTP Health Check Server
  // Cloud Run requires an HTTP server listening on PORT to pass startup and liveness probes.
  // In local development, PORT=4000 is used by the API server, so worker defaults to WORKER_PORT or skips HTTP binding.
  const healthPort = process.env.WORKER_PORT
    ? parseInt(process.env.WORKER_PORT, 10)
    : process.env.K_SERVICE
      ? parseInt(process.env.PORT || "8080", 10)
      : process.env.PORT && process.env.PORT !== "4000"
        ? parseInt(process.env.PORT, 10)
        : null;

  let healthServer: http.Server | null = null;
  if (healthPort) {
    healthServer = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "healthy",
          service: config.serviceName,
          uptime: Math.floor(process.uptime()),
        }),
      );
    });

    healthServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        logger.warn(
          "HEALTH_SERVER",
          `Health check port ${healthPort} is already in use. Worker background queue processing continues normally without HTTP health probe.`,
        );
      } else {
        logger.error("HEALTH_SERVER", `Health check server error: ${err.message}`);
      }
    });

    try {
      healthServer.listen(healthPort, () => {
        logger.info(
          "HEALTH_SERVER",
          `Health check server listening on port ${healthPort}`,
        );
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn("HEALTH_SERVER", `Could not bind health server: ${msg}`);
    }
  }

  // 6. Graceful shutdown handling
  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(
      "SHUTDOWN_START",
      `Received ${signal}. Initiating graceful worker shutdown...`,
    );
    clearInterval(heartbeatInterval);
    clearInterval(recoveryInterval);

    try {
      if (healthServer) {
        healthServer.close();
      }
      await closeEmailWorker();
      await emailSearchService.close();
      await disconnectDatabase();
      logger.info(
        "SHUTDOWN_COMPLETE",
        "Graceful worker shutdown completed successfully.",
      );
      process.exit(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("SHUTDOWN_ERROR", `Error during graceful shutdown: ${msg}`);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void bootstrapWorker();
