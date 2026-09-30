import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRecipientInput } from '../src/lib/recipients.js';

describe('CSV/text recipient parsing', () => {
    it('normalizes addresses and removes duplicate emails', () => {
        assert.deepStrictEqual(
            parseRecipientInput('Alice@Example.com, alice@example.com\nBob@example.org'),
            {
                rawCount: 3,
                validCount: 2,
                duplicateCount: 1,
                invalidCount: 0,
                recipients: ['alice@example.com', 'bob@example.org'],
            },
        );
    });

    it('reports malformed address-like entries without adding them', () => {
        assert.deepStrictEqual(parseRecipientInput('ok@example.com; not-an-email@;'), {
            rawCount: 2,
            validCount: 1,
            duplicateCount: 0,
            invalidCount: 1,
            recipients: ['ok@example.com'],
        });
    });
});