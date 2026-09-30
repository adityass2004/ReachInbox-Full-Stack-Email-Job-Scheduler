# ReachInbox — Full-Stack Email Job Scheduler

## 1. Overview

ReachInbox Email Job Scheduler is a distributed, production-grade email scheduling and delivery system. It schedules emails across multiple recipients with computed delay spacing, enforces per-sender hourly rate limits, executes concurrent job processing with BullMQ and Redis, delivers emails through Ethereal SMTP, persists state across service restarts via PostgreSQL, and provides a Next.js web dashboard.

## 2. Architecture

```mermaid
flowchart TD
    User([User Browser]) -->|HTTP / Cookie Session| Web[Next.js Frontend Portal]
    Web -->|REST API / JSON| API[Express.js REST API]
    API -->|Prisma ORM| DB[(PostgreSQL Database)]
    API -->|Bulk Enqueue addBulk| Redis[(Redis / BullMQ Queue)]
    API -->|Bulk Document Index| ES[(Elasticsearch Cloud)]
    Worker[BullMQ Worker Engine] -->|BRPOPLPUSH / Atomic Locks| Redis
    Worker -->|Fetch Job & Update Status| DB
    Worker -->|SMTP Delivery| Ethereal[Ethereal SMTP Server]
    Worker -->|Sync Delivery Status| ES
    Worker -->|Post Rate Limit Alert| Slack[Slack Web API]
```

### Component Responsibilities

- **Frontend Portal (`apps/web`)**: Next.js 14 web app providing Google authentication, compose interface with batch recipient parsing, scheduled email queue monitor, sent email history, and Slack integration settings.
- **REST API (`apps/api`)**: Express.js server providing authentication, request validation, PostgreSQL campaign/job creation, bulk BullMQ enqueueing, Elasticsearch search with database fallback, and Bull Board queue management.
- **Worker Engine (`apps/worker`)**: Standalone BullMQ worker processing `email-send` jobs with configurable concurrency, Redis atomic delay reservations, sliding hourly rate limits, Ethereal SMTP dispatching, and Slack rate-limit webhook notifications.
- **PostgreSQL**: System of record storing users, senders, campaigns, email jobs with unique idempotency keys, and encrypted OAuth tokens.
- **Redis**: BullMQ delayed job storage, distributed worker locking, atomic delay reservations, and hourly counter tracking.
- **Elasticsearch**: Full-text search engine indexing scheduled and sent email records by recipient, subject, and status.
- **Ethereal SMTP**: Test email transport providing message dispatch and preview URLs without sending real external emails.
- **Slack API**: Webhook notification target receiving alerts when a sender exceeds the hourly sending threshold.

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.5 |
| Runtime | Node.js 20 LTS |
| Backend Framework | Express.js 4.19 |
| Frontend Framework | Next.js 14.2 (App Router), React 18 |
| Styling | Tailwind CSS 3.4 |
| Database | PostgreSQL 16 |
| ORM | Prisma Client 5.22 |
| Distributed Queue | BullMQ 5.8 |
| In-Memory Store | Redis 7 |
| Search Engine | Elasticsearch 8.13 |
| Mail Transport | Ethereal SMTP (Nodemailer 6.9) |
| Queue Dashboard | Bull Board (@bull-board/express 5.21) |
| Containerization | Docker, Docker Compose |
| Authentication | Google OAuth 2.0, Jose (JWT sessions) |
| Notification | Slack Web API OAuth |

## 4. Core Features

| Area | Feature | Status |
|---|---|---|
| Backend | Email scheduling with computed future timestamps | Implemented |
| Backend | BullMQ delayed jobs via native Redis sorted sets | Implemented |
| Backend | Redis persistence and state management | Implemented |
| Backend | PostgreSQL transactional persistence | Implemented |
| Backend | SHA-256 idempotency key deduplication | Implemented |
| Backend | Configurable worker concurrency | Implemented |
| Backend | Per-sender atomic delay pacing | Implemented |
| Backend | Sliding hourly rate limiting per sender | Implemented |
| Backend | Multi-sender support linked to user account | Implemented |
| Backend | Elasticsearch full-text search with DB fallback | Implemented |
| Backend | Bull Board queue monitoring dashboard | Implemented |
| Backend | Slack rate-limit notification with hour deduplication | Implemented |
| Backend | Crash and restart recovery for pending jobs | Implemented |
| Frontend | Google OAuth login | Implemented |
| Frontend | Session logout | Implemented |
| Frontend | Dashboard with Scheduled and Sent metrics | Implemented |
| Frontend | Scheduled emails table with pagination | Implemented |
| Frontend | Sent emails table with search and filters | Implemented |
| Frontend | Compose modal with Send Now and Send Later | Implemented |
| Frontend | Space, comma, tab, and newline recipient paste parser | Implemented |
| Frontend | Recipient count badge and collapsible chip preview | Implemented |
| Frontend | Configurable start time date-time picker | Implemented |
| Frontend | Delay between emails input | Implemented |
| Frontend | Hourly sending limit input | Implemented |
| Frontend | Loading skeletons and submit spinners | Implemented |
| Frontend | Empty states for tables and search | Implemented |
| Frontend | Form validation and error toast notifications | Implemented |
| Frontend | Figma-inspired design system tokens | Implemented |

## 5. Backend Flow

1. User submits a batch of recipients, subject, body, start time, delay, and hourly limit.
2. API validates input using Zod schemas and sanitizes recipient emails.
3. API computes deterministic SHA-256 idempotency keys and pre-allocated UUIDs for each recipient.
4. Database transaction creates the Campaign and batch-inserts EmailJob records in PostgreSQL with status `SCHEDULED`.
5. API indexes the scheduled email records into Elasticsearch asynchronously.
6. API enqueues delayed jobs into BullMQ using Redis `addBulk` with computed delay offsets.
7. Worker picks up jobs at their scheduled execution time respecting worker concurrency.
8. Worker executes atomic Redis delay reservation to maintain minimum spacing between sends for the sender.
9. Worker checks and increments the sliding hourly rate limit in Redis.
10. If limit is exceeded, worker updates status to `RESCHEDULED`, delays the job to the next hour window, and notifies Slack.
11. If within limit, worker sends the email through Ethereal SMTP and captures the message ID and preview URL.
12. Worker updates PostgreSQL job status to `SENT`, increments campaign counters, and updates the Elasticsearch index.

## 6. Scheduling

- Scheduling uses BullMQ delayed jobs backed by Redis sorted sets (`zset`). Cron is not used.
- Execution delay is calculated as `scheduledAt.getTime() - Date.now()`.
- For batches with multiple recipients, each recipient job is staggered by index:
  `scheduledAt = baseStartTime + (recipientIndex * delayBetweenEmailsMs)`
- BullMQ promotes delayed jobs to the active queue as soon as their timestamp matures.
- No polling loops are used for scheduling; Redis timers handle job promotion.

## 7. Persistence & Restart Recovery

- **PostgreSQL Persistence**: Every email job is committed to PostgreSQL before queueing. The database record holds the authoritative state (`SCHEDULED`, `SENT`, `FAILED`, `RESCHEDULED`).
- **Redis Queue Persistence**: Redis Append-Only File (AOF) ensures queued and delayed BullMQ job definitions survive Redis restarts.
- **Worker Crash Recovery**: BullMQ automatically detects stalled jobs via lock renewal heartbeats. If a worker process crashes mid-execution, another worker instance reclaims the job.
- **API Crash Recovery**: Since jobs are queued in Redis and stored in PostgreSQL, API server downtime has zero effect on already-scheduled jobs.
- **Deduplication**: Each email job contains a unique `idempotencyKey` computed from `userId`, `senderEmail`, `recipientEmail`, `subject`, `body`, and `scheduledAt`. PostgreSQL unique constraints reject duplicate requests.
- **Orphan Recovery Script**: An included reconciliation script scans PostgreSQL for `SCHEDULED` jobs missing from Redis and re-enqueues them without duplicates.

## 8. Rate Limiting & Concurrency

- **Worker Concurrency**: Configured via `WORKER_CONCURRENCY` (default: `5`). Each worker instance processes up to 5 jobs simultaneously.
- **Minimum Send Delay**: Configured via `MIN_EMAIL_DELAY_MS` (default: `2000`). Enforced atomically in Redis using an atomic reservation script to serialize sends per sender.
- **Hourly Email Limit**: Configured via `MAX_EMAILS_PER_HOUR_PER_SENDER` (default: `200`). Tracked using Redis keys keyed by sender and hour window with TTL expiration.
- **Limit Exceeded Behavior**: When the hourly limit is exhausted, the current job is marked `RESCHEDULED` in PostgreSQL, delayed in BullMQ to the start of the next hour window, and a Slack alert is triggered.
- **Multi-Instance Safety**: All delays and counters use Redis atomic primitives (`INCR`, `EVAL`), ensuring rate limits remain accurate across horizontally scaled workers.

## 9. Elasticsearch

- **Indexed Data**: Every email job is indexed into the `reachinbox-emails` index containing `emailJobId`, `userId`, `recipient`, `sender`, `subject`, `status`, `campaignId`, `scheduledAt`, and `sentAt`.
- **Indexing Trigger**: Jobs are bulk-indexed when scheduled, and updated when marked `SENT`, `FAILED`, or `RESCHEDULED`.
- **Search Capabilities**: Supports multi-match full-text search across `recipient` and `subject` fields, with boolean filters for `userId` and `status`.
- **Resilience**: Elasticsearch operations are wrapped in error handling. If Elasticsearch is unreachable, queries fall back to PostgreSQL `ILIKE` search without failing requests.

## 10. Slack Integration

- **OAuth Flow**: Standard Slack OAuth 2.0 flow initiated via `/api/integrations/slack/connect` and finalized via `/api/integrations/slack/callback`.
- **Token Security**: Slack access tokens and incoming webhook URLs are encrypted at rest using AES-256-GCM before being stored in the `slack_connections` database table.
- **Notification Trigger**: Triggered when a sender hits their configured hourly limit. The message contains the sender email, limit value, affected job ID, and next execution window.
- **Deduplication**: Notifications are deduplicated per sender and hour window using Redis keys with a 2-hour TTL to prevent channel spam.
- **Disconnection**: Users can disconnect their Slack workspace at `/api/integrations/slack/disconnect`, which revokes the connection and clears database records.

## 11. API Overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Service health status, uptime, and version |
| GET | `/api/auth/google` | Initiates Google OAuth 2.0 login flow |
| GET | `/api/auth/google/callback` | Handles Google OAuth callback and sets session cookie |
| GET | `/api/auth/me` | Returns authenticated user profile |
| POST | `/api/auth/logout` | Clears authentication session cookie |
| POST | `/api/emails/schedule` | Validates, persists, and queues a batch of scheduled emails |
| GET | `/api/emails/scheduled` | Returns paginated scheduled and rescheduled email jobs |
| GET | `/api/emails/search` | Full-text search across emails with status and pagination |
| GET | `/api/emails/:id` | Returns single email job details with Ethereal preview URL |
| GET | `/api/senders` | Lists configured senders for the authenticated user |
| GET | `/api/integrations/slack/connect` | Initiates Slack OAuth connection |
| GET | `/api/integrations/slack/callback` | Handles Slack OAuth callback and stores encrypted tokens |
| POST | `/api/integrations/slack/disconnect` | Disconnects Slack workspace |
| GET | `/api/integrations/slack/status` | Returns Slack integration connection status |
| ALL | `/admin/queues` | Bull Board visual monitoring interface (admin authenticated) |

## 12. Environment Variables

### Backend (`apps/api`)

```env
PORT=4000
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://user:password@host:port/database?pgbouncer=true
DIRECT_URL=postgresql://user:password@host:port/database
REDIS_URL=redis://host:port
ELASTICSEARCH_URL=https://host:port
ELASTICSEARCH_API_KEY=...
JWT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=...
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_REDIRECT_URI=...
BULL_BOARD_ADMIN_EMAILS=...
MAX_EMAILS_PER_HOUR_PER_SENDER=200
```

### Worker (`apps/worker`)

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:port/database?pgbouncer=true
DIRECT_URL=postgresql://user:password@host:port/database
REDIS_URL=redis://host:port
ELASTICSEARCH_URL=https://host:port
ELASTICSEARCH_API_KEY=...
WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
SLACK_NOTIFICATION_CHANNEL_ID=...
```

### Frontend (`apps/web`)

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### Database & Infrastructure

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgrespassword
POSTGRES_DB=reachinbox
ETHEREAL_USER=...
ETHEREAL_PASSWORD=...
```

## 13. Running Locally

Refer to `RUN.md` for complete step-by-step setup instructions.

```text
git clone <repository-url>
cd main_project
pnpm install
docker compose up -d
pnpm db:push
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

## 14. Docker

The project provides multi-stage production Dockerfiles for each component:

- `apps/api/Dockerfile`: Multi-stage build running compiled Express API on Alpine Node.js.
- `apps/worker/Dockerfile`: Multi-stage build running compiled BullMQ worker on Alpine Node.js.
- `apps/web/Dockerfile`: Next.js standalone output image.
- `docker-compose.yml`: Local infrastructure orchestration running PostgreSQL, Redis, and Elasticsearch.

Commands:

```bash
docker compose up -d
docker compose down
docker build -t reachinbox-api:latest -f apps/api/Dockerfile .
docker build -t reachinbox-worker:latest -f apps/worker/Dockerfile .
docker build -t reachinbox-web:latest -f apps/web/Dockerfile .
```

## 15. Deployment

- **Backend API**: Deployed on Google Cloud Run (`asia-south1`) running the containerized Express application.
- **Worker Engine**: Deployed on Google Cloud Run (`asia-south1`) with CPU always allocated (`--no-cpu-throttling`) and minimum 1 instance (`--min-instances 1`) for uninterrupted background queue processing.
- **Frontend Portal**: Production Next.js web application configured for deployment on Vercel or Cloud Run.
- **Database**: Managed PostgreSQL instance (Supabase) accessed via transaction pooler with `pgbouncer=true`.
- **Redis Queue**: Cloud Redis instance (Upstash) maintaining BullMQ sorted sets and locks.
- **Search Engine**: Elastic Cloud Elasticsearch cluster.

## 16. Assignment Requirement Mapping

| Assignment Requirement | Implementation |
|---|---|
| TypeScript + Express | Monorepo package `apps/api` with strict TypeScript, Express routers, controllers, and Zod validators |
| BullMQ + Redis | BullMQ 5 queue implementation in `packages/shared/src/queue` with Upstash/local Redis |
| Relational DB | PostgreSQL with Prisma schema defining Users, Senders, Campaigns, EmailJobs, and SlackConnections |
| Ethereal SMTP | Nodemailer transport in `apps/worker/src/services/ethereal-smtp.service.ts` with preview URL logging |
| Delayed Scheduling | BullMQ native delayed jobs using timestamp calculation without cron dependencies |
| Persistence | Authoritative state in PostgreSQL; queue state in Redis AOF; surviving restarts |
| Idempotency | SHA-256 idempotency key on every job enforced by PostgreSQL unique constraint and BullMQ job IDs |
| Concurrency | BullMQ worker concurrency control (`WORKER_CONCURRENCY`) processing parallel jobs |
| Delay Between Emails | Atomic Redis reservation script enforcing minimum spacing per sender |
| Hourly Rate Limiting | Sliding hourly window in Redis rescheduling jobs exceeding limit to next hour |
| Slack Notification | OAuth integration in `apps/api` and webhook dispatcher in `apps/worker` sending rate-limit alerts |
| Elasticsearch | Full-text search service in `packages/shared/src/search` with fallback to PostgreSQL |
| Google OAuth | OAuth 2.0 flow with cryptographic state verification and HTTP-only session cookies |
| Dashboard | Next.js App Router portal with live counters, Scheduled queue table, and Sent history |
| Compose Interface | Recipient chip parser, Send Now, Send Later popover, delay, and hourly limit controls |
| Scheduled Table | Paginated table with search, status badges, and detail slide-out drawer |
| Sent Table | Sent email history with delivery status and live Ethereal sandbox preview links |
| Docker Setup | Multi-stage Dockerfiles for all apps and local Docker Compose infrastructure |
| Deployment | Containerized Cloud Run API and Worker with managed cloud backing services |

## 17. Assumptions / Trade-offs

- **Ethereal vs Production SMTP**: Ethereal SMTP is used to allow reviewers to inspect actual email delivery and preview links safely without sending real external emails.
- **PgBouncer Connection Pooling**: Supabase port 6543 uses transaction mode; Prisma connections automatically append `pgbouncer=true` to prevent prepared statement errors.
- **Deterministic Job IDs**: BullMQ job IDs match database UUIDs, allowing bulk insertion without separate reconciliation queries.
- **Elasticsearch Graceful Fallback**: If Elasticsearch is unavailable, search automatically falls back to PostgreSQL `ILIKE` queries to guarantee continuous service availability.
- **Worker Cloud Run Configuration**: Cloud Run requires `--no-cpu-throttling` and `--min-instances 1` so BullMQ worker background timers run continuously outside incoming HTTP requests.

## 18. Demo

- [ ] Log in via Google OAuth.
- [ ] View Dashboard counters for Scheduled and Sent emails.
- [ ] Open Compose modal and paste multiple recipient emails.
- [ ] Configure start time, delay between emails, and hourly limit.
- [ ] Schedule emails and verify they appear in the Scheduled view.
- [ ] Wait for scheduled delivery time; verify status changes to Sent with Ethereal preview link.
- [ ] Stop backend API or worker container, restart it, and verify remaining scheduled jobs execute on schedule.
- [ ] Schedule emails exceeding hourly limit to demonstrate automatic rescheduling and Slack notification.

## 19. Submission

- **Repository**: Private GitHub repository.
- **Reviewer Access**: Access granted to user `Mitrajit`.
- **Submission Form**: Completed via the ReachInbox submission link.
