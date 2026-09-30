import { createApp } from './app.js';
import { config } from './config/env.js';
import { closeEmailQueue, disconnectDatabase, emailSearchService } from '@reachinbox/shared';

const app = createApp();

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[API Server] Running at http://localhost:${config.port} in ${config.nodeEnv} mode`);
  // eslint-disable-next-line no-console
  console.log(`[API Server] Health check available at http://localhost:${config.port}/health`);
});

// Graceful shutdown handling
const shutdown = (signal: string) => {
  // eslint-disable-next-line no-console
  console.log(`\n[API Server] Received ${signal}. Gracefully shutting down...`);
  server.close(() => {
    void (async () => {
      try {
        await closeEmailQueue();
        await emailSearchService.close();
        await disconnectDatabase();
        // eslint-disable-next-line no-console
        console.log('[API Server] Closed HTTP and queue connections.');
        process.exit(0);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[API Server] Shutdown error:', error);
        process.exit(1);
      }
    })();
  });

  // Force exit if connections take too long to close
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error('[API Server] Force shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
