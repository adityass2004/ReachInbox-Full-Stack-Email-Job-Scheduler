import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';

const isTest = process.env.NODE_ENV === 'test';

/**
 * Standard API rate limiter to protect public and authenticated endpoints from abuse.
 * Configured for 300 requests per 15-minute window per IP.
 */
export const apiRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 0 : 300,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests from this IP. Please wait a few minutes and try again.',
      },
    });
  },
});

/**
 * Stricter rate limiter specifically for burst scheduling and upload endpoints.
 * Allows up to 30 schedule submissions per 1-minute window per IP.
 */
export const scheduleRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 0 : 30,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Email scheduling rate limit reached. Please wait a moment before submitting more batches.',
      },
    });
  },
});
