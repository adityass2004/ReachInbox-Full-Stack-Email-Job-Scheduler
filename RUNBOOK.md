# ReachInbox — Operational Runbook & Demo Guide

## 1. Prerequisites

- Node.js 20 LTS or higher
- pnpm 9.7.1
- Docker and Docker Compose
- Git
- Google OAuth credentials
- Ethereal Email account
- Slack App credentials (optional for alerts)
- Elasticsearch 8.13 (optional, fallback to PostgreSQL exists)

## 2. Environment Variables

### Root / Backend Environment (`.env` or `apps/api/.env`)

```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5433/reachinbox
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
JWT_SECRET=reachinbox-local-development-jwt-secret-min32chars
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_REDIRECT_URI=http://localhost:4000/api/integrations/slack/callback
BULL_BOARD_ADMIN_EMAILS=admin@reachinbox.ai
MAX_EMAILS_PER_HOUR_PER_SENDER=200
```

### Worker Environment (`apps/worker/.env`)

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5433/reachinbox
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
SLACK_NOTIFICATION_CHANNEL_ID=
```

### Frontend Environment (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## 3. Local Startup

Start the entire stack using Docker Compose:

```bash
docker compose up -d
```

Or run via pnpm in separate terminals as shown below.

## 4. Redis/PostgreSQL Startup

```bash
docker compose up -d postgres redis elasticsearch
pnpm db:generate
pnpm db:push
```

## 5. Backend Startup

```bash
pnpm dev:api
```

Backend REST API runs on port 4000.

## 6. Worker Startup

```bash
pnpm dev:worker
```

BullMQ worker engine connects to Redis, recovers pending jobs, and processes delivery.

## 7. Frontend Startup

```bash
pnpm dev:web
```

Next.js web portal runs on `http://localhost:3000`.

## 8. How to Schedule an Email

1. Open `http://localhost:3000` in browser and log in.
2. Click Compose.
3. Paste recipient email addresses (supports space, comma, semicolon, newline, or CSV upload).
4. Enter Subject and Body.
5. Choose Send Now or Send Later (select date and future time).
6. Set Delay between emails (default: 2s) and Hourly sending limit (default: 200).
7. Click Send / Schedule.

## 9. How to Verify Scheduled Emails

1. Navigate to Scheduled page (`/scheduled`).
2. Verify recipient, subject, scheduled time `[Date Time]`, and `SCHEDULED` status badge.
3. Click any email row to view the detail slide-out drawer with metadata and idempotency key.

## 10. How to Verify Sent Emails

1. Navigate to Sent page (`/sent`).
2. Verify recipient, subject, sent time, and `SENT` status badge.
3. Click the external link icon or detail drawer to open the live Ethereal sandbox preview URL.

## 11. Exact Restart-Persistence Demo Commands

Step 1: Schedule an email 3 minutes into the future from the UI.
Step 2: Confirm the email appears with status `SCHEDULED` in `/scheduled`.
Step 3: Stop the API and worker processes while keeping Redis and PostgreSQL alive:
```bash
docker compose stop api worker
```
Step 4: Verify Redis and PostgreSQL containers remain running:
```bash
docker compose ps
```
Step 5: Start API and worker containers again:
```bash
docker compose start api worker
```
Step 6: Stream worker logs to observe BullMQ recovering the existing delayed job:
```bash
docker compose logs -f worker
```
Step 7: Wait until the scheduled time arrives.
Step 8: Verify the email transitions to `SENT` in the UI without duplicates.

## 12. Exact Rate-Limit Demo Configuration

Step 1: Set temporary small limits in `.env` or `apps/worker/.env`:
```env
MAX_EMAILS_PER_HOUR=3
EMAIL_SEND_DELAY_MS=2000
WORKER_CONCURRENCY=5
```
Step 2: Restart the worker service:
```bash
docker compose restart worker
```
Step 3: In the UI, schedule 5 emails to different recipients.
Step 4: Observe worker behavior:
- First 3 emails send immediately with 2-second spacing.
- 4th and 5th emails trigger the hourly limit check.
- Jobs are rescheduled to the beginning of the next hour window (`RESCHEDULED`).
- No jobs are failed or dropped.

## 13. How to Inspect Worker Logs

```bash
docker compose logs -f worker
```

For local process run:
Worker output streams directly in Terminal 2 (`pnpm dev:worker`).

## 14. How to Inspect BullMQ

Open the Bull Board visual dashboard in your browser:

```text
http://localhost:4000/admin/queues
```

Displays:
- Waiting jobs
- Delayed jobs
- Active jobs
- Completed jobs
- Failed jobs

Note: User email must be listed in `BULL_BOARD_ADMIN_EMAILS`.

## 15. Google OAuth Setup

1. Open Google Cloud Console -> APIs & Services -> Credentials.
2. Create OAuth 2.0 Client ID (Web Application).
3. Set Authorized Redirect URI: `http://localhost:4000/api/auth/google/callback`
4. Set Authorized JavaScript Origin: `http://localhost:3000`
5. Copy Client ID and Client Secret into `.env`.

## 16. Ethereal Setup

Ethereal test accounts are generated on first send automatically, or manually created at:
`https://ethereal.email/create`
Add credentials to `ETHEREAL_USER` and `ETHEREAL_PASSWORD` in `.env`.

## 17. Slack Setup

1. Open Slack API Console (`api.slack.com/apps`) -> Create New App.
2. In OAuth & Permissions, add Redirect URL:
   `http://localhost:4000/api/integrations/slack/callback`
3. Add Bot Token Scopes: `chat:write`, `channels:read`.
4. Copy Client ID and Client Secret into `.env`.
5. Connect Slack workspace from the portal: `http://localhost:3000/settings/integrations`.

## 18. Production URLs

```text
Frontend: http://localhost:3000
Backend API: https://reachinbox-api-457999655459.asia-south1.run.app
Worker Service: https://reachinbox-worker-457999655459.asia-south1.run.app
Health Endpoint: https://reachinbox-api-457999655459.asia-south1.run.app/health
Bull Board Dashboard: https://reachinbox-api-457999655459.asia-south1.run.app/admin/queues
```

## 19. Troubleshooting

- **Redis connection failed**: Ensure Redis is running on port 6379 (`docker compose up -d redis`).
- **Database pooler connection**: Ensure `DATABASE_URL` contains `?pgbouncer=true` when using Supabase pooler on port 6543.
- **Worker not processing**: Check that API and Worker point to the same `REDIS_URL`.
- **CORS blocked**: Ensure `CORS_ORIGIN` matches the frontend host (`http://localhost:3000` or `*.vercel.app`).
- **Bull Board 403 Forbidden**: Ensure the logged-in user email matches `BULL_BOARD_ADMIN_EMAILS`.
