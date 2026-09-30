import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { ZodError } from 'zod';
import { config } from './config/env.js';
import { healthRouter } from './routes/health.js';
import { apiRouter } from './routes/index.js';
import { HttpError } from './middleware/http-error.js';
import { bullBoardRouter } from './routes/bull-board.router.js';
import { apiRateLimiter } from './middleware/rate-limiter.js';

export function createApp(): Express {
  const app = express();

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Basic middleware
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (!requestOrigin) return callback(null, true);
        if (config.corsOrigin && requestOrigin === config.corsOrigin) return callback(null, true);
        if (
          /^https?:\/\/localhost(:\d+)?$/.test(requestOrigin) ||
          requestOrigin.endsWith('.run.app') ||
          requestOrigin.endsWith('.vercel.app')
        ) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  const validateRequestOrigin = (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    const origin = req.get('origin');
    if (!origin) {
      next();
      return;
    }
    const host = req.get('host');
    const isSameHost = host && (origin === `https://${host}` || origin === `http://${host}`);
    const isConfiguredOrigin = origin === config.corsOrigin;
    const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
    const isCloudRun = origin.endsWith('.run.app');
    const isVercel = origin.endsWith('.vercel.app');

    if (isSameHost || isConfiguredOrigin || isLocalhost || isCloudRun || isVercel) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: { code: 'INVALID_ORIGIN', message: 'Request origin is not allowed' },
    });
  };
  app.use(['/api', '/admin/queues'], validateRequestOrigin);

  // Direct root health check (e.g. for Google Cloud Run / health probes)
  app.use('/', healthRouter);

  // API sub-routes with rate limiting
  app.use('/api', apiRateLimiter, apiRouter);

  // Protected Bull Board for the email-send queue
  app.use('/admin/queues', bullBoardRouter);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
      },
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Check for Zod validation error
    if (err instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request parameters or payload',
          details: err.issues,
        },
      });
      return;
    }

    if (err instanceof HttpError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }

    // eslint-disable-next-line no-console
    console.error('[API Error]:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  return app;
}
