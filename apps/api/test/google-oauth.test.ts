import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { config } from '../src/config/env.js';
import { createGoogleAuthorizationUrl } from '../src/services/google-oauth.service.js';
import { createApp } from '../src/app.js';

describe('Google OAuth routes and consent URL', () => {
    it('returns a safe error when OAuth or session configuration is missing', async () => {
        const oldValues = {
            clientId: config.googleClientId,
            clientSecret: config.googleClientSecret,
            callbackUrl: config.googleCallbackUrl,
            jwtSecret: config.jwtSecret,
        };
        config.googleClientId = '';
        config.googleClientSecret = '';
        config.googleCallbackUrl = '';
        config.jwtSecret = '';
        const app = createApp();
        const server = app.listen(0);

        try {
            const { port } = server.address() as AddressInfo;
            const response = await fetch(`http://localhost:${port}/api/auth/google`);
            assert.strictEqual(response.status, 503);
            const json = (await response.json()) as { error: { code: string } };
            assert.strictEqual(json.error.code, 'GOOGLE_AUTH_NOT_CONFIGURED');
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            config.googleClientId = oldValues.clientId;
            config.googleClientSecret = oldValues.clientSecret;
            config.googleCallbackUrl = oldValues.callbackUrl;
            config.jwtSecret = oldValues.jwtSecret;
        }
    });

    it('builds a Google authorization URL with state and the configured callback', () => {
        const oldValues = {
            clientId: config.googleClientId,
            clientSecret: config.googleClientSecret,
            callbackUrl: config.googleCallbackUrl,
        };
        config.googleClientId = 'test-google-client.apps.googleusercontent.com';
        config.googleClientSecret = 'test-google-secret';
        config.googleCallbackUrl = 'http://localhost:4000/api/auth/google/callback';

        try {
            const url = new URL(createGoogleAuthorizationUrl('one-time-state'));
            assert.strictEqual(url.origin, 'https://accounts.google.com');
            assert.strictEqual(url.pathname, '/o/oauth2/v2/auth');
            assert.strictEqual(url.searchParams.get('state'), 'one-time-state');
            assert.strictEqual(url.searchParams.get('redirect_uri'), config.googleCallbackUrl);
            assert.ok(url.searchParams.get('scope')?.includes('openid'));
        } finally {
            config.googleClientId = oldValues.clientId;
            config.googleClientSecret = oldValues.clientSecret;
            config.googleCallbackUrl = oldValues.callbackUrl;
        }
    });

    it('returns only safe persisted profile fields from the authenticated session', async () => {
        const app = createApp();
        const server = app.listen(0);

        try {
            const { port } = server.address() as AddressInfo;
            const response = await fetch(`http://localhost:${port}/api/auth/me`);
            assert.strictEqual(response.status, 200);
            const json = (await response.json()) as {
                success: boolean;
                data: { id: string; email: string; name: string; avatar: string | null };
            };
            assert.strictEqual(json.success, true);
            assert.strictEqual(json.data.email, 'test@reachinbox.local');
            assert.deepStrictEqual(Object.keys(json.data).sort(), ['avatar', 'email', 'id', 'name']);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});