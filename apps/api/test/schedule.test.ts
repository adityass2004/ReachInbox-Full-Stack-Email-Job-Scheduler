import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { scheduleEmailSchema } from '../src/validators/email.validator.js';

describe('Email Scheduling API & Validation', () => {
  it('validates and sanitizes valid email schedule input', () => {
    const rawInput = {
      senderEmail: 'Sender@ReachInbox.COM',
      recipients: [
        'User1@Example.com',
        ' user2@example.com ',
        'user1@example.com', // duplicate
        'invalid-email',
      ],
      subject: 'Quarterly Update',
      body: '<p>Here is your update.</p>',
      delayBetweenEmailsMs: 3000,
      hourlyLimit: 150,
    };

    const parsed = scheduleEmailSchema.parse(rawInput);
    assert.strictEqual(parsed.senderEmail, 'Sender@ReachInbox.COM');
    assert.strictEqual(parsed.recipients.length, 2);
    assert.deepStrictEqual(parsed.recipients, ['user1@example.com', 'user2@example.com']);
    assert.strictEqual(parsed.delayBetweenEmailsMs, 3000);
    assert.strictEqual(parsed.hourlyLimit, 150);
    assert.strictEqual(
      scheduleEmailSchema.parse({ ...rawInput, hourlyLimit: undefined }).hourlyLimit,
      undefined,
    );
  });

  it('rejects input with empty recipients or invalid emails', () => {
    assert.throws(
      () =>
        scheduleEmailSchema.parse({
          senderEmail: 'sender@example.com',
          recipients: [],
          subject: 'Test',
          body: 'Body',
        }),
      /recipient/,
    );

    assert.throws(
      () =>
        scheduleEmailSchema.parse({
          senderEmail: 'not-an-email',
          recipients: ['valid@example.com'],
          subject: 'Test',
          body: 'Body',
        }),
      /sender email/,
    );
  });

  it('POST /api/emails/schedule returns 400 on invalid payload', async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/api/emails/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields
          senderEmail: 'invalid-email',
        }),
      });

      assert.strictEqual(response.status, 400);
      const json = (await response.json()) as { success: boolean; error: { code: string } };
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, 'VALIDATION_ERROR');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /api/emails/scheduled validates pagination parameters', async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/api/emails/scheduled?page=-1`);
      assert.strictEqual(response.status, 400);
      const json = (await response.json()) as { success: boolean; error: { code: string } };
      assert.strictEqual(json.success, false);
      assert.strictEqual(json.error.code, 'VALIDATION_ERROR');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /api/emails/search validates pagination and status filters', async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/api/emails/search?page=0&status=NOT_A_STATUS`);
      assert.strictEqual(response.status, 400);
      const json = (await response.json()) as { error: { code: string } };
      assert.strictEqual(json.error.code, 'VALIDATION_ERROR');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /api/emails/search rejects invalid status lists', async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/api/emails/search?statuses=SENT,UNKNOWN`);
      assert.strictEqual(response.status, 400);
      const json = (await response.json()) as { error: { code: string } };
      assert.strictEqual(json.error.code, 'VALIDATION_ERROR');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /api/emails/search degrades gracefully when Elasticsearch is unavailable', async () => {
    const previousUrl = process.env.ELASTICSEARCH_URL;
    process.env.ELASTICSEARCH_URL = 'http://127.0.0.1:9201';
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/api/emails/search?q=welcome`);
      assert.strictEqual(response.status, 503);
      const json = (await response.json()) as { error: { code: string } };
      assert.strictEqual(json.error.code, 'SEARCH_UNAVAILABLE');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previousUrl === undefined) delete process.env.ELASTICSEARCH_URL;
      else process.env.ELASTICSEARCH_URL = previousUrl;
    }
  });

  it('rejects an invalid session and ignores caller-supplied user IDs', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/api/emails/scheduled`, {
        headers: {
          Cookie: 'reachinbox_session=invalid-token',
          'x-user-id': '00000000-0000-0000-0000-000000000001',
        },
      });
      assert.strictEqual(response.status, 401);
      const json = (await response.json()) as { error: { code: string } };
      assert.strictEqual(json.error.code, 'UNAUTHENTICATED');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('rejects cross-origin state-changing requests', async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/api/auth/logout`, {
        method: 'POST',
        headers: { Origin: 'https://attacker.example' },
      });
      assert.strictEqual(response.status, 403);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('clears the session cookie on logout', async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/api/auth/logout`, {
        method: 'POST',
      });
      assert.strictEqual(response.status, 200);
      assert.match(response.headers.get('set-cookie') || '', /reachinbox_session=/);
      assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
