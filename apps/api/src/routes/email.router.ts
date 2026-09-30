import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { scheduleRateLimiter } from '../middleware/rate-limiter.js';
import { emailController } from '../controllers/email.controller.js';

export const emailRouter: Router = Router();

// POST /api/emails/schedule - schedule a new batch of emails
emailRouter.post('/schedule', authenticate, scheduleRateLimiter, (req, res, next) => {
  emailController.schedule(req, res, next);
});

// GET /api/emails/scheduled - paginated list of scheduled emails
emailRouter.get('/scheduled', authenticate, (req, res, next) => {
  emailController.getScheduled(req, res, next);
});

emailRouter.get('/search', authenticate, (req, res, next) => {
  emailController.search(req, res, next);
});

// GET /api/emails/:id - single email job details
emailRouter.get('/:id', authenticate, (req, res, next) => {
  emailController.getById(req, res, next);
});
