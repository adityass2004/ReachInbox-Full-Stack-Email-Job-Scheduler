import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT } from 'jose';
import {
    createSessionToken,
    getSessionUserId,
} from '../src/services/auth-session.service.js';

const testSecret = 'test-session-signing-secret-with-more-than-32-bytes';

describe('Google OAuth session tokens', () => {
    it('verifies the signed user subject and rejects tampered tokens', async () => {
        const token = await createSessionToken(
            { id: 'user-123', email: 'user@example.com' },
            testSecret,
        );

        assert.strictEqual(await getSessionUserId(token, testSecret), 'user-123');
        assert.strictEqual(await getSessionUserId(`${token}x`, testSecret), null);
        assert.strictEqual(await getSessionUserId(token, `${testSecret}-wrong`), null);
    });

    it('rejects expired sessions', async () => {
        const now = Math.floor(Date.now() / 1000);
        const expiredToken = await new SignJWT({ email: 'user@example.com' })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuer('reachinbox-api')
            .setAudience('reachinbox-web')
            .setSubject('user-123')
            .setIssuedAt(now - 60)
            .setExpirationTime(now - 1)
            .sign(new TextEncoder().encode(testSecret));

        assert.strictEqual(await getSessionUserId(expiredToken, testSecret), null);
    });

    it('requires a sufficiently strong signing secret', async () => {
        await assert.rejects(
            createSessionToken({ id: 'user-123', email: 'user@example.com' }, 'short'),
            /at least 32 bytes/,
        );
        await assert.rejects(
            createSessionToken(
                { id: 'user-123', email: 'user@example.com' },
                'replace-with-a-secure-random-secret-for-jwt-token-signing',
            ),
            /non-placeholder/,
        );
    });
});