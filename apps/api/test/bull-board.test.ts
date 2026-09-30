import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { closeEmailQueue, getEmailQueue, scheduleEmailJob } from '@reachinbox/shared';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';

after(async () => {
    await closeEmailQueue();
});

describe('Bull Board access control', () => {
    before(async () => {
        await getEmailQueue().waitUntilReady();
    });

    it('denies authenticated users not present in the admin allowlist', async () => {
        const previousAllowlist = config.bullBoardAdminEmails;
        config.bullBoardAdminEmails = [];
        const app = createApp();
        const server = app.listen(0);

        try {
            const { port } = server.address() as AddressInfo;
            const response = await fetch(`http://localhost:${port}/admin/queues`);
            assert.strictEqual(response.status, 403);
            const json = (await response.json()) as { error: { code: string } };
            assert.strictEqual(json.error.code, 'ADMIN_ACCESS_REQUIRED');
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            config.bullBoardAdminEmails = previousAllowlist;
        }
    });

    it('serves the dashboard to an allowlisted authenticated user', async () => {
        const previousAllowlist = config.bullBoardAdminEmails;
        config.bullBoardAdminEmails = ['test@reachinbox.local'];
        const app = createApp();
        const server = app.listen(0);

        try {
            const { port } = server.address() as AddressInfo;
            const response = await fetch(`http://localhost:${port}/admin/queues/`);
            assert.strictEqual(response.status, 200);
            const html = await response.text();
            assert.match(html, /<html/i);
            assert.match(html, /<base href="\/admin\/queues\/"/);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            config.bullBoardAdminEmails = previousAllowlist;
        }
    });

    it('reports a real delayed BullMQ job in the dashboard queue API', async () => {
        const queue = getEmailQueue();
        const emailJobId = `bull-board-check-${randomUUID()}`;
        const scheduledAt = new Date(Date.now() + 60_000);
        await scheduleEmailJob({
            emailJobId,
            scheduledAt,
            idempotencyKey: emailJobId,
        });
        const server = createApp().listen(0);

        try {
            const { port } = server.address() as AddressInfo;
            const response = await fetch(`http://localhost:${port}/admin/queues/api/queues`);
            assert.strictEqual(response.status, 200);
            const result = (await response.json()) as {
                queues: Array<{ name: string; counts: Record<string, number> }>;
            };
            const emailQueue = result.queues.find((item) => item.name === 'email-send');
            assert.ok(emailQueue);
            assert.ok(emailQueue.counts.delayed >= 1);
            const job = await queue.getJob(emailJobId);
            assert.strictEqual(await job?.getState(), 'delayed');
        } finally {
            const job = await queue.getJob(emailJobId);
            if (job) await job.remove();
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });

    it('requires a session before applying admin authorization in production', async () => {
        const previousNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        const app = createApp();
        const server = app.listen(0);

        try {
            const { port } = server.address() as AddressInfo;
            const response = await fetch(`http://localhost:${port}/admin/queues`, {
                headers: { 'x-user-id': '00000000-0000-0000-0000-000000000001' },
            });
            assert.strictEqual(response.status, 401);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
            if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previousNodeEnv;
        }
    });
});