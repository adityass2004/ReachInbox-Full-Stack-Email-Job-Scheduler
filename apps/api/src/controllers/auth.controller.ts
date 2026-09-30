import { createHash, randomBytes } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { prisma } from '@reachinbox/shared';
import { config } from '../config/env.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
    AUTH_COOKIE_NAME,
    createSessionToken,
    isSessionSecretConfigured,
    sessionCookieOptions,
} from '../services/auth-session.service.js';
import {
    createGoogleAuthorizationUrl,
    exchangeGoogleCode,
    GoogleOAuthError,
    persistGoogleUser,
} from '../services/google-oauth.service.js';

const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

function hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
}

function queryString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isGoogleOAuthConfigured(): boolean {
    return Boolean(
        config.googleClientId &&
        config.googleClientSecret &&
        config.googleCallbackUrl,
    );
}

function configurationError(res: Response): void {
    res.status(503).json({
        success: false,
        error: {
            code: 'GOOGLE_AUTH_NOT_CONFIGURED',
            message: 'Google authentication is not configured',
        },
    });
}

export const authController = {
    async google(_req: Request, res: Response, next: NextFunction): Promise<void> {
        if (!isGoogleOAuthConfigured()) {
            configurationError(res);
            return;
        }

        try {
            const state = randomBytes(32).toString('base64url');
            const now = new Date();
            await prisma.googleOAuthState.deleteMany({
                where: { expiresAt: { lte: now } },
            });
            await prisma.googleOAuthState.create({
                data: {
                    stateHash: hashState(state),
                    expiresAt: new Date(now.getTime() + GOOGLE_STATE_TTL_MS),
                },
            });

            res.redirect(302, createGoogleAuthorizationUrl(state));
        } catch (error) {
            next(error);
        }
    },

    async callback(req: Request, res: Response, next: NextFunction): Promise<void> {
        if (!isGoogleOAuthConfigured()) {
            configurationError(res);
            return;
        }

        try {
            const state = queryString(req.query.state);
            if (!state || state.length > 512) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state is invalid or expired' },
                });
                return;
            }

            const consumedState = await prisma.googleOAuthState.deleteMany({
                where: { stateHash: hashState(state), expiresAt: { gt: new Date() } },
            });
            if (consumedState.count !== 1) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_OAUTH_STATE', message: 'OAuth state is invalid or expired' },
                });
                return;
            }

            if (queryString(req.query.error)) {
                res.status(400).json({
                    success: false,
                    error: { code: 'GOOGLE_AUTH_DENIED', message: 'Google authorization was not granted' },
                });
                return;
            }

            const code = queryString(req.query.code);
            if (!code || code.length > 4096) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_OAUTH_CALLBACK', message: 'Google authorization callback is invalid' },
                });
                return;
            }

            const identity = await exchangeGoogleCode(code);
            const user = await persistGoogleUser(identity);
            const sessionToken = await createSessionToken(user);
            res.cookie(AUTH_COOKIE_NAME, sessionToken, {
                ...sessionCookieOptions(),
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
            res.redirect(302, config.corsOrigin);
        } catch (error) {
            if (error instanceof GoogleOAuthError) {
                res.status(400).json({
                    success: false,
                    error: { code: 'GOOGLE_AUTH_FAILED', message: error.message },
                });
                return;
            }
            next(error);
        }
    },

    async logout(_req: Request, res: Response): Promise<void> {
        res.clearCookie(AUTH_COOKIE_NAME, sessionCookieOptions());
        res.status(200).json({ success: true, data: { authenticated: false } });
    },

    me(req: AuthenticatedRequest, res: Response): void {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: { code: 'UNAUTHENTICATED', message: 'Authentication is required' },
            });
            return;
        }

        res.status(200).json({
            success: true,
            data: {
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                avatar: req.user.avatar,
            },
        });
    },
};