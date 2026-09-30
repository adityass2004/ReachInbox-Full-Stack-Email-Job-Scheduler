import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  scheduleEmailSchema,
  getScheduledEmailsQuerySchema,
  searchEmailsQuerySchema,
} from '../validators/email.validator.js';
import { emailSchedulerService } from '../services/email-scheduler.service.js';

export class EmailController {
  /**
   * POST /api/emails/schedule
   * Validates input, creates authoritative DB records, and queues BullMQ delayed jobs.
   */
  async schedule(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validatedInput = scheduleEmailSchema.parse(req.body);
      const userId = req.user!.id;

      const result = await emailSchedulerService.scheduleBatch(userId, validatedInput);

      res.status(201).json({
        success: true,
        message: `Successfully scheduled ${result.totalScheduled} email(s)`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/emails/scheduled
   * Returns paginated scheduled and rescheduled emails for the user.
   */
  async getScheduled(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = getScheduledEmailsQuerySchema.parse(req.query);
      const userId = req.user!.id;

      const result = await emailSchedulerService.getScheduledEmails(userId, query);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/emails/:id
   * Returns details for a single email job by ID.
   */
  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const emailJob = await emailSchedulerService.getEmailJobById(id, userId);

      if (!emailJob) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email job with ID ${id} not found`,
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: emailJob,
      });
    } catch (error) {
      next(error);
    }
  }

  async search(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = searchEmailsQuerySchema.parse(req.query);
      const result = await emailSchedulerService.searchEmailJobs(req.user!.id, query);

      if (!result) {
        res.status(503).json({
          success: false,
          error: {
            code: 'SEARCH_UNAVAILABLE',
            message: 'Email search is temporarily unavailable',
          },
        });
        return;
      }

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const emailController = new EmailController();
