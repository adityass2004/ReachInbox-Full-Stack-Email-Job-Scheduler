import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError, apiErrorMessage } from '../src/lib/api.js';

describe('API error messages', () => {
    it('maps common HTTP failures to safe, actionable feedback', () => {
        assert.strictEqual(apiErrorMessage(new ApiError('Invalid subject', 400)), 'Invalid subject');
        assert.match(apiErrorMessage(new ApiError('Authentication is required', 401)), /session has expired/i);
        assert.strictEqual(apiErrorMessage(new ApiError('Rate limit exceeded', 429)), 'Rate limit exceeded');
        assert.strictEqual(apiErrorMessage(new ApiError('Internal error', 500)), 'Internal error');
        assert.strictEqual(apiErrorMessage(new Error('offline'), 'Offline fallback'), 'Offline fallback');
    });
});