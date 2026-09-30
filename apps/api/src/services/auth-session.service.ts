import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config/env.js';

export const AUTH_COOKIE_NAME = 'reachinbox_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function resolveSessionSecret(secret = config.jwtSecret): string {
    if (
        secret &&
        Buffer.byteLength(secret, 'utf8') >= 32 &&
        !/(replace-with|change-me|placeholder|example)/i.test(secret)
    ) {
        return secret;
    }
    // Fall back to deriving secret from googleClientSecret only when secret is not explicitly provided
    if (!secret && config.googleClientSecret) {
        return createHash('sha256').update(`reachinbox-session:${config.googleClientSecret}`).digest('hex');
    }
    return secret;
}

export function isSessionSecretConfigured(secret = config.jwtSecret): boolean {
    const resolved = resolveSessionSecret(secret);
    return (
        Buffer.byteLength(resolved, 'utf8') >= 32 &&
        !/(replace-with|change-me|placeholder|example)/i.test(resolved)
    );
}

function signingKey(secret = config.jwtSecret): Uint8Array {
    const resolved = resolveSessionSecret(secret);
    if (!isSessionSecretConfigured(resolved)) {
        throw new Error('JWT_SECRET must be a non-placeholder secret of at least 32 bytes');
    }
    return new TextEncoder().encode(resolved);
}

export async function createSessionToken(
    user: { id: string; email: string },
    secret = config.jwtSecret,
): Promise<string> {
    return new SignJWT({ email: user.email })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('reachinbox-api')
        .setAudience('reachinbox-web')
        .setSubject(user.id)
        .setIssuedAt()
        .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
        .sign(signingKey(secret));
}

export async function getSessionUserId(
    token: string,
    secret = config.jwtSecret,
): Promise<string | null> {
    try {
        const { payload } = await jwtVerify(token, signingKey(secret), {
            algorithms: ['HS256'],
            issuer: 'reachinbox-api',
            audience: 'reachinbox-web',
        });
        return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
        return null;
    }
}

export function sessionCookieOptions() {
    const isProduction = config.nodeEnv === 'production';
    return {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? ('none' as const) : ('lax' as const),
        path: '/',
    };
}