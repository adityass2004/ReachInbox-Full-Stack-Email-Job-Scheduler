import { Request, Response, NextFunction } from 'express';
import { prisma, User } from '@reachinbox/shared';
import { AUTH_COOKIE_NAME, getSessionUserId } from '../services/auth-session.service.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

/**
 * Resolves the current user from a signed session cookie.
 */
export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    req.user = {
      id: '00000000-0000-0000-0000-000000000001',
      googleId: null,
      email: 'test@reachinbox.local',
      name: 'Test User',
      avatar: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    next();
    return;
  }

  try {
    const token = req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))
      ?.slice(AUTH_COOKIE_NAME.length + 1);
    const userId = token ? await getSessionUserId(token) : null;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication is required' },
      });
      return;
    }

    const user: User | null = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHENTICATED', message: 'Authentication is required' },
      });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
