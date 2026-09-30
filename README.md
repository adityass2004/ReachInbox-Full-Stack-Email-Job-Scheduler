# ReachInbox — Email Job Scheduler

A distributed, production-grade email scheduling system with rate limiting, BullMQ job queues, full-text search, and a Next.js dashboard.

**Live Links**
- [Frontend (Vercel)](https://reach-inbox-email-job-scheduler-steel.vercel.app/scheduled)
- [Backend API](https://reachinbox-api-457999655459.asia-south1.run.app)
- [Worker Service](https://reachinbox-worker-457999655459.asia-south1.run.app)
- [Health Check](https://reachinbox-api-457999655459.asia-south1.run.app/health)
- [Bull Board Dashboard](https://reachinbox-api-457999655459.asia-south1.run.app/admin/queues)

---

## Architecture

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

| Service | Role |
|---|---|
| `apps/web` | Next.js 14 dashboard — compose, schedule, search |
| `apps/api` | Express REST API — auth, scheduling, search |
| `apps/worker` | BullMQ worker — SMTP delivery, rate limiting |
| PostgreSQL | Source of truth for all job state |
| Redis | BullMQ queues, atomic rate-limit counters |
| Elasticsearch | Full-text search with PostgreSQL fallback |
| Ethereal SMTP | Test email transport with preview URLs |
| Slack API | Rate-limit alert notifications |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.5 |
| Backend | Express.js 4.19 |
| Frontend | Next.js 14, React 18, Tailwind CSS |
| Database | PostgreSQL 16 + Prisma ORM |
| Queue | BullMQ 5 + Redis 7 |
| Search | Elasticsearch 8.13 |
| Auth | Google OAuth 2.0 + JWT sessions |
| Notifications | Slack Web API |
| Containers | Docker + Docker Compose |

---

## Key Features

- Batch email scheduling with computed per-recipient delay offsets
- BullMQ delayed jobs via Redis sorted sets (no cron)
- SHA-256 idempotency keys with PostgreSQL unique constraint deduplication
- Sliding hourly rate limit per sender — exceeded jobs auto-reschedule to next window
- Atomic Redis delay reservation for minimum spacing between sends
- Crash recovery — stalled BullMQ jobs reclaimed automatically; orphan recovery script for PostgreSQL/Redis drift
- Elasticsearch full-text search with silent PostgreSQL fallback
- Slack OAuth integration with AES-256-GCM encrypted token storage
- Bull Board queue monitoring dashboard
- Google OAuth login with HTTP-only session cookies

---

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Health status and uptime |
| GET | `/api/auth/google` | Start Google OAuth flow |
| GET | `/api/auth/google/callback` | OAuth callback |
| GET | `/api/auth/me` | Authenticated user profile |
| POST | `/api/auth/logout` | Clear session |
| POST | `/api/emails/schedule` | Schedule a batch of emails |
| GET | `/api/emails/scheduled` | Paginated scheduled jobs |
| GET | `/api/emails/search` | Full-text search |
| GET | `/api/emails/:id` | Single job details |
| GET | `/api/senders` | List senders |
| GET | `/api/integrations/slack/connect` | Start Slack OAuth |
| GET | `/api/integrations/slack/callback` | Slack OAuth callback |
| POST | `/api/integrations/slack/disconnect` | Disconnect Slack |
| GET | `/api/integrations/slack/status` | Slack connection status |
| ALL | `/admin/queues` | Bull Board UI |

---

## Environment Variables

**`apps/api/.env`**
```env
PORT=4000
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://user:password@host:port/database?pgbouncer=true
DIRECT_URL=postgresql://user:password@host:port/database
REDIS_URL=redis://host:port
ELASTICSEARCH_URL=https://host:port
ELASTICSEARCH_API_KEY=<key>
JWT_SECRET=<secret>
GOOGLE_CLIENT_ID=<id>
GOOGLE_CLIENT_SECRET=<secret>
GOOGLE_CALLBACK_URL=<url>
SLACK_CLIENT_ID=<id>
SLACK_CLIENT_SECRET=<secret>
SLACK_REDIRECT_URI=<url>
BULL_BOARD_ADMIN_EMAILS=<emails>
MAX_EMAILS_PER_HOUR_PER_SENDER=200
```

**`apps/worker/.env`**
```env
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:port/database?pgbouncer=true
DIRECT_URL=postgresql://user:password@host:port/database
REDIS_URL=redis://host:port
ELASTICSEARCH_URL=https://host:port
ELASTICSEARCH_API_KEY=<key>
WORKER_CONCURRENCY=5
MIN_EMAIL_DELAY_MS=2000
MAX_EMAILS_PER_HOUR_PER_SENDER=200
SLACK_NOTIFICATION_CHANNEL_ID=<id>
```

**`apps/web/.env`**
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## Running Locally

```bash
git clone <repository-url>
cd main_project
pnpm install
docker compose up -d
pnpm db:push
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

---

## Deployment

| Service | Platform |
|---|---|
| Frontend | [Vercel](https://reach-inbox-email-job-scheduler-steel.vercel.app/scheduled) |
| API + Worker | Google Cloud Run (`asia-south1`) |
| Database | Supabase (PostgreSQL + PgBouncer) |
| Redis | Upstash |
| Search | Elastic Cloud |

Worker is deployed with `--no-cpu-throttling` and `--min-instances 1` so BullMQ timers run continuously.
