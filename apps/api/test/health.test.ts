import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';
import { AddressInfo } from 'node:net';

describe('API Health Endpoint', () => {
  it('GET /health returns 200 with status ok and valid metadata', async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/health`);
      assert.strictEqual(response.status, 200);

      const body = (await response.json()) as {
        status: string;
        service: string;
        timestamp: string;
        uptimeSeconds: number;
        version: string;
      };

      assert.strictEqual(body.status, 'ok');
      assert.strictEqual(body.service, 'reachinbox-api');
      assert.strictEqual(typeof body.uptimeSeconds, 'number');
      assert.strictEqual(typeof body.timestamp, 'string');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /api/health returns 200 on API sub-router', async () => {
    const app = createApp();
    const server = app.listen(0);

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/api/health`);
      assert.strictEqual(response.status, 200);

      const body = (await response.json()) as { status: string };
      assert.strictEqual(body.status, 'ok');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
