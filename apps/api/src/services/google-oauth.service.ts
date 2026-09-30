import { OAuth2Client } from 'google-auth-library';
import { prisma, User } from '@reachinbox/shared';
import { config } from '../config/env.js';

export class GoogleOAuthError extends Error { }

export interface GoogleIdentity {
    googleId: string;
    email: string;
    name: string;
    avatar: string | null;
}

function createOAuthClient(): OAuth2Client {
    return new OAuth2Client(
        config.googleClientId,
        config.googleClientSecret,
        config.googleCallbackUrl,
    );
}

export function createGoogleAuthorizationUrl(state: string): string {
    return createOAuthClient().generateAuthUrl({
        access_type: 'online',
        prompt: 'select_account',
        scope: ['openid', 'email', 'profile'],
        state,
    });
}

export async function exchangeGoogleCode(code: string): Promise<GoogleIdentity> {
    try {
        const client = createOAuthClient();
        const { tokens } = await client.getToken(code);
        if (!tokens.id_token) throw new GoogleOAuthError('Google ID token is missing');

        const ticket = await client.verifyIdToken({
            idToken: tokens.id_token,
            audience: config.googleClientId,
        });
        const profile = ticket.getPayload();
        if (!profile?.sub || !profile.email || profile.email_verified !== true) {
            throw new GoogleOAuthError('Google account identity could not be verified');
        }

        return {
            googleId: profile.sub,
            email: profile.email.toLowerCase(),
            name: profile.name?.trim() || profile.email,
            avatar: profile.picture || null,
        };
    } catch (error) {
        if (error instanceof GoogleOAuthError) throw error;
        throw new GoogleOAuthError('Google authorization failed or expired');
    }
}

export async function persistGoogleUser(identity: GoogleIdentity): Promise<User> {
    try {
        return await prisma.$transaction(async (transaction) => {
            const googleUser = await transaction.user.findUnique({
                where: { googleId: identity.googleId },
            });
            if (googleUser) {
                return transaction.user.update({
                    where: { id: googleUser.id },
                    data: {
                        email: identity.email,
                        name: identity.name,
                        avatar: identity.avatar,
                    },
                });
            }

            const emailUser = await transaction.user.findUnique({
                where: { email: identity.email },
            });
            if (emailUser) {
                if (emailUser.googleId && emailUser.googleId !== identity.googleId) {
                    throw new GoogleOAuthError('Google account cannot be linked to this user');
                }
                return transaction.user.update({
                    where: { id: emailUser.id },
                    data: {
                        googleId: identity.googleId,
                        name: identity.name,
                        avatar: identity.avatar,
                    },
                });
            }

            return transaction.user.create({
                data: {
                    googleId: identity.googleId,
                    email: identity.email,
                    name: identity.name,
                    avatar: identity.avatar,
                },
            });
        });
    } catch (error) {
        if (error instanceof GoogleOAuthError) throw error;
        throw new GoogleOAuthError('Google user could not be saved');
    }
}