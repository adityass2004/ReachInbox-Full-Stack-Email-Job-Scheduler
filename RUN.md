# ReachInbox — Run Instructions

## 1. Prerequisites

- Node.js 20 LTS or higher
- pnpm 9.7.1
- Docker and Docker Compose
- Git
- Google OAuth credentials
- Ethereal Email account
- Slack App credentials (optional for alerts)
- Elasticsearch 8.13 (optional, fallback to PostgreSQL exists)

## 2. Clone Repository

```bash
git clone <repository-url>
cd main_project
```

## 3. Project Structure

```text
main_project/
├── apps/
│   ├── api/
│   ├── web/
│   └── worker/
├── packages/
│   └── shared/
├── prisma/
│   └── schema.prisma
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── README.md
└── RUN.md
```

## 4. Environment Configuration

### Backend Environment (`apps/api/.env` or root `.env`)

```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5433/reachinbox
REDIS_URL=redis://localhost:6379
ELASTICSEARCH_URL=http://localhost:9200
JWT_SECRET=your_32_character_minimum_secure_jwt_secret_value
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_REDIRECT_URI=http://localhost:4000/api/integrations/slack/callback
BULL_BOARD_ADMIN_EMAILS=admin@reachinbox.ai
MAX_EMAILS_PER_HOUR_PER_SENDER=200
```

### Worker Environment (`apps/worker/.env` or root `.env`)

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

### Infrastructure Environment

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgrespassword
POSTGRES_DB=reachinbox
```

### Where to Obtain Credentials

- **Ethereal SMTP**: Generated automatically on first send, or manually at https://ethereal.email/create
- **Google OAuth**: Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs
- **Slack App**: Slack API portal -> Create App -> OAuth & Permissions -> Redirect URLs & Bot Scopes (`chat:write`)
- **Elasticsearch**: Elastic Cloud Console or local Docker instance (`localhost:9200`)

## 5. Start Infrastructure

```bash
docker compose up -d
```

## 6. Database Setup

```bash
pnpm install
pnpm db:generate
pnpm db:push
```

Seeding is optional. If test data is required:

```bash
pnpm db:seed
```

## 7. Backend Setup

```bash
cd apps/api
pnpm install
pnpm dev
```

Backend API runs on port 4000.

## 8. Worker Setup

```bash
cd apps/worker
pnpm install
pnpm dev
```

The worker connects to Redis, consumes jobs from the `email-send` BullMQ queue, delivers messages through Ethereal SMTP, and applies rate limits and delay rules.

## 9. Frontend Setup

```bash
cd apps/web
pnpm install
pnpm dev
```

Frontend runs on port 3000. Production build commands:

```bash
pnpm build
pnpm start
```

## 10. Run Everything Locally

Terminal 1 (Infrastructure):
```bash
docker compose up -d
```

Terminal 2 (Database Preparation):
```bash
pnpm db:generate
pnpm db:push
```

Terminal 3 (Backend API):
```bash
pnpm dev:api
```

Terminal 4 (Worker Engine):
```bash
pnpm dev:worker
```

Terminal 5 (Frontend):
```bash
pnpm dev:web
```

## 11. Docker Run

Build and run individual application containers:

```bash
docker build -t reachinbox-api:latest -f apps/api/Dockerfile .
docker build -t reachinbox-worker:latest -f apps/worker/Dockerfile .
docker build -t reachinbox-web:latest -f apps/web/Dockerfile .
```

Run containers:

```bash
docker run -d --name reachinbox-api -p 4000:4000 --env-file apps/api/.env reachinbox-api:latest
docker run -d --name reachinbox-worker --env-file apps/worker/.env reachinbox-worker:latest
docker run -d --name reachinbox-web -p 3000:3000 reachinbox-web:latest
```

Stop and remove containers:

```bash
docker stop reachinbox-web reachinbox-api reachinbox-worker
docker rm reachinbox-web reachinbox-api reachinbox-worker
```

## 12. Verify Backend

Verify service health:

```bash
curl http://localhost:4000/health
```

Successful response:

```json
{"status":"ok","service":"reachinbox-api","timestamp":"2026-09-30T10:00:00.000Z","uptimeSeconds":15,"version":"1.0.0"}
```

## 13. Verify Queue / Worker

Check Redis connection:

```bash
docker exec -it reachinbox-redis redis-cli ping
```

Access Bull Board queue dashboard:
Open browser at `http://localhost:4000/admin/queues` using an account listed in `BULL_BOARD_ADMIN_EMAILS`.

## 14. Test Email Scheduling

1. Open `http://localhost:3000` in browser.
2. Sign in via Google OAuth.
3. Click Compose button.
4. Paste comma- or space-separated recipients into the recipient input.
5. Enter subject and body content.
6. Select Send Later and pick a future execution time.
7. Set delay (default: 2s) and hourly limit (default: 200).
8. Click Send Later.
9. Open Scheduled page to verify jobs are listed with status `SCHEDULED`.
10. Wait for execution time.
11. Open Sent page to verify emails transitioned to status `SENT`.
12. Click on any sent email to open the drawer and view the Ethereal sandbox preview link.

## 15. Restart Recovery Test

1. Schedule an email 5 minutes into the future from the Compose interface.
2. Confirm the email appears with status `SCHEDULED` in the Scheduled table.
3. Stop the backend and worker processes:
```bash
docker compose stop reachinbox-api reachinbox-worker
```
4. Confirm PostgreSQL database maintains the records.
5. Restart the backend and worker processes:
```bash
docker compose start reachinbox-api reachinbox-worker
```
6. Wait until the scheduled execution time arrives.
7. Observe the worker picking up and delivering the email without duplication.
8. Verify status updates to `SENT`.

## 16. Rate Limit / Concurrency Test

1. In Compose, paste 10 recipient email addresses.
2. Set Delay between emails to 3 seconds.
3. Set Hourly sending limit to 5.
4. Schedule the batch.
5. Observe worker logs:
   - First 5 emails are dispatched with 3-second spacing.
   - 6th email triggers the hourly limit check.
   - Emails 6 through 10 are rescheduled to the beginning of the next hour window.
   - Status updates to `RESCHEDULED` in PostgreSQL.

## 17. Elasticsearch Test

Verify Elasticsearch index:

```bash
curl http://localhost:9200/reachinbox-emails/_count
```

Test search query endpoint:

```bash
curl "http://localhost:4000/api/emails/search?q=testuser&page=1&limit=10"
```

## 18. Slack Test

1. Navigate to Settings -> Integrations (`http://localhost:3000/settings/integrations`).
2. Click Connect Slack and authorize workspace permissions.
3. Run the rate limit test from Section 16 to exhaust the hourly limit.
4. Check the authorized Slack channel for the automated rate-limit alert.
5. Click Disconnect Slack and verify status updates to disconnected.

## 19. Production Deployment

### Backend API (Google Cloud Run)

```bash
docker build -t asia-south1-docker.pkg.dev/reachinbox-510202/reachinbox/reachinbox-api:latest -f apps/api/Dockerfile .
docker push asia-south1-docker.pkg.dev/reachinbox-510202/reachinbox/reachinbox-api:latest
gcloud run deploy reachinbox-api \
  --image asia-south1-docker.pkg.dev/reachinbox-510202/reachinbox/reachinbox-api:latest \
  --region asia-south1 \
  --project reachinbox-510202
```

### BullMQ Worker (Google Cloud Run)

```bash
docker build -t asia-south1-docker.pkg.dev/reachinbox-510202/reachinbox/reachinbox-worker:latest -f apps/worker/Dockerfile .
docker push asia-south1-docker.pkg.dev/reachinbox-510202/reachinbox/reachinbox-worker:latest
gcloud run deploy reachinbox-worker \
  --image asia-south1-docker.pkg.dev/reachinbox-510202/reachinbox/reachinbox-worker:latest \
  --region asia-south1 \
  --project reachinbox-510202 \
  --min-instances 1 \
  --no-cpu-throttling
```

### Frontend (Vercel)

1. Connect GitHub repository to Vercel.
2. Set Root Directory to `main_project/apps/web`.
3. Configure environment variable: `NEXT_PUBLIC_API_URL`.
4. Deploy using `apps/web/vercel.json` settings.

## 20. Troubleshooting

- **Redis Connection Refused**: Verify Redis container is running with `docker ps` and port 6379 is accessible.
- **Database Connection Terminated**: Ensure `DATABASE_URL` contains `?pgbouncer=true` when connecting to pooled PostgreSQL instances.
- **Google OAuth Redirect Mismatch**: Ensure `GOOGLE_CALLBACK_URL` exactly matches the URI registered in Google Cloud Console.
- **Worker Not Processing Jobs**: Ensure Redis URL matches between API and Worker, and `email-send` queue name is consistent.
- **CORS Errors in Browser**: Verify `CORS_ORIGIN` in backend environment matches the frontend origin (`http://localhost:3000`).
- **Slack Notification Skipped**: Ensure a channel ID is configured in the Slack integration or via `SLACK_NOTIFICATION_CHANNEL_ID`.

## 21. Production URLs

```text
Frontend: http://localhost:3000
Backend: https://reachinbox-api-457999655459.asia-south1.run.app
Worker: https://reachinbox-worker-457999655459.asia-south1.run.app
Health: https://reachinbox-api-457999655459.asia-south1.run.app/health
BullMQ Dashboard: https://reachinbox-api-457999655459.asia-south1.run.app/admin/queues
```
