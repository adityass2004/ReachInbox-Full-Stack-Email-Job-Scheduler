import { NextFunction, Response } from 'express';
import { config } from '../config/env.js';
import { AuthenticatedRequest } from './auth.js';

export function authorizeQueueAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const email = req.user?.email.trim().toLowerCase();
  if (!email) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Authentication is required' },
    });
    return;
  }

  const allowedEmails = config.bullBoardAdminEmails;
  const isAllowed = allowedEmails.includes('*') || (allowedEmails.length > 0 && allowedEmails.includes(email));
  if (!isAllowed) {
    res.status(403).json({
      success: false,
      error: { code: 'ADMIN_ACCESS_REQUIRED', message: 'Queue admin access is required' },
    });
    return;
  }

  next();
}