import { createHash, randomBytes } from 'node:crypto';
import { NextFunction, Response } from 'express';
import {
    encryptSlackToken,
    hasValidSlackTokenEncryptionKey,
    prisma,
} from '@reachinbox/shared';
import { config } from '../config/env.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
    exchangeSlackAuthorizationCode,
    SlackProviderError,
} from '../services/slack-oauth.service.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function stateHash(state: string): string {
    return createHash('sha256').update(state).digest('hex');
}

function queryString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isSlackConfigured(): boolean {
    return Boolean(
        config.slackClientId && config.slackClientSecret && config.slackRedirectUri,
    ) && hasValidSlackTokenEncryptionKey();
}

function redirectToSlackSettings(res: Response, result: 'connected' | 'denied' | 'error'): void {
    const destination = new URL('/settings/integrations', config.corsOrigin);
    destination.searchParams.set('slack', result);
    res.redirect(302, destination.toString());
}

export const slackController = {
    async connect(
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            if (!isSlackConfigured()) {
                res.status(503).json({
                    success: false,
                    error: { code: 'SLACK_NOT_CONFIGURED', message: 'Slack integration is not configured' },
                });
                return;
            }

            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({
                    success: false,
                    error: { code: 'UNAUTHORIZED', message: 'Authentication is required' },
                });
                return;
            }

            const state = randomBytes(32).toString('base64url');
            const now = new Date();
            await prisma.slackOAuthState.deleteMany({ where: { expiresAt: { lte: now } } });
            await prisma.slackOAuthState.create({
                data: {
                    stateHash: stateHash(state),
                    userId,
                    expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
                },
            });

            const authorizationUrl = new URL('https://slack.com/oauth/v2/authorize');
            authorizationUrl.search = new URLSearchParams({
                client_id: config.slackClientId,
                scope: 'chat:write,channels:read',
                redirect_uri: config.slackRedirectUri,
                state,
            }).toString();

            res.redirect(302, authorizationUrl.toString());
        } catch (error) {
            next(error);
        }
    },

    async callback(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
        try {
            const state = queryString(req.query.state);
            const code = queryString(req.query.code);
            if (!state || state.length > 512) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_OAUTH_STATE', message: 'Slack authorization state is invalid or expired' },
                });
                return;
            }

            const now = new Date();
            const stateRecord = await prisma.$transaction(async (transaction) => {
                const existing = await transaction.slackOAuthState.findUnique({
                    where: { stateHash: stateHash(state) },
                });
                if (!existing || existing.expiresAt <= now) return null;

                const consumed = await transaction.slackOAuthState.deleteMany({
                    where: { stateHash: existing.stateHash, expiresAt: { gt: now } },
                });
                return consumed.count === 1 ? existing : null;
            });

            if (!stateRecord) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_OAUTH_STATE', message: 'Slack authorization state is invalid or expired' },
                });
                return;
            }

            const providerError = queryString(req.query.error);
            if (providerError) {
                redirectToSlackSettings(res, 'denied');
                return;
            }

            if (!code || code.length > 4096 || !isSlackConfigured()) {
                res.status(400).json({
                    success: false,
                    error: { code: 'INVALID_OAUTH_CALLBACK', message: 'Slack authorization callback is invalid' },
                });
                return;
            }

            const connection = await exchangeSlackAuthorizationCode(code);
            const encryptedToken = encryptSlackToken(connection.accessToken);
            const savedConnection = await prisma.slackConnection.upsert({
                where: { userId: stateRecord.userId },
                create: {
                    userId: stateRecord.userId,
                    encryptedToken,
                    teamId: connection.teamId,
                    teamName: connection.teamName,
                    active: true,
                },
                update: {
                    encryptedToken,
                    teamId: connection.teamId,
                    teamName: connection.teamName,
                    active: true,
                },
                select: { teamId: true, teamName: true, active: true },
            });

            redirectToSlackSettings(res, savedConnection.active ? 'connected' : 'error');
        } catch (error) {
            if (error instanceof SlackProviderError) {
                redirectToSlackSettings(res, 'error');
                return;
            }
            next(error);
        }
    },

    async disconnect(
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            if (!req.user?.id) {
                res.status(401).json({
                    success: false,
                    error: { code: 'UNAUTHORIZED', message: 'Authentication is required' },
                });
                return;
            }

            await prisma.slackConnection.deleteMany({ where: { userId: req.user.id } });
            res.status(200).json({ success: true, data: { connected: false } });
        } catch (error) {
            next(error);
        }
    },

    async status(
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            if (!req.user?.id) {
                res.status(401).json({
                    success: false,
                    error: { code: 'UNAUTHORIZED', message: 'Authentication is required' },
                });
                return;
            }

            const connection = await prisma.slackConnection.findUnique({
                where: { userId: req.user.id },
                select: { active: true, teamId: true, teamName: true, channelId: true, channelName: true },
            });
            res.status(200).json({
                success: true,
                data: {
                    connected: Boolean(connection?.active),
                    teamId: connection?.teamId ?? null,
                    teamName: connection?.teamName ?? null,
                    channelId: connection?.channelId ?? null,
                    channelName: connection?.channelName ?? null,
                },
            });
        } catch (error) {
            next(error);
        }
    },
};