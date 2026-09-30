# ReachInbox Full-Stack Email Job Scheduler

A production-grade, distributed email job scheduler built with Next.js, Express, TypeScript, Prisma, PostgreSQL, BullMQ, Redis, Elasticsearch, and Ethereal SMTP.

---

## 1. System Architecture

```text
                                   ┌──────────────────────┐
                                   │ Google OAuth 2.0 /   │
                                   │    Slack OAuth 2.0   │
                                   └──────────┬───────────┘
                                              │ Auth Callbacks
                                              ▼
┌─────────────────────────┐   HTTP/JSON   ┌────────────────────────────────┐
│  Next.js 14 Web Portal  │ ────────────> │       Express REST API         │
│  (Tailwind CSS + Toast) │               │   (Helmet, Rate-Limit, Zod)    │
└─────────────────────────┘               └───────────────┬────────────────┘
                                                          │
                             ┌────────────────────────────┴───────────────────────────┐
                             │                                                        │
                             ▼                                                        ▼
                 ┌───────────────────────┐                                ┌───────────────────────┐
                 │ PostgreSQL (Supabase) │                                │  Redis (BullMQ Queue) │
                 │  * Source of Truth *  │                                │ * Execution Trigger * │
                 └───────────┬───────────┘                                └───────────┬───────────┘
                             │                                                        │
                             │                  ┌────────────────────────┐            │
                             ├────────────────> │  BullMQ Worker Cluster │ <──────────┘
                             │ State & History  │  (Stateless Pacing)    │
                             │                  └───────────┬────────────┘
                             │                              │
                ┌────────────┴───────────┐                  ├────────────────────────┐
                ▼                        ▼                  ▼                        ▼
    ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────┐ ┌───────────────────────────┐
    │ Elasticsearch 8      │ │ Bull Board Dashboard │ │ Ethereal     │ │ Slack Channel             │
    │ (Fast Query & Sync)  │ │ (/admin/queues)      │ │ SMTP Relay   │ │ (Rate-Limit Alerts)       │
    └──────────────────────┘ └──────────────────────┘ └──────────────┘ └───────────────────────────┘
```

### Component Roles

1. **Next.js Web Portal (`apps/web`)**:
   - Modern, responsive client with authenticated shell, recipient CSV/paste parsing, live scheduled and sent dashboards, search, and Slack OAuth integration settings.
2. **Express REST API (`apps/api`)**:
   - Protected by Helmet security headers, CORS origin verification, and `express-rate-limit`.
   - Mounts Google OAuth session auth, bulk email scheduling, Elasticsearch search endpoints, Slack OAuth flows, and protected Bull Board queue monitoring.
3. **BullMQ Worker Cluster (`apps/worker`)**:
   - Scalable background worker service executing delayed and recurring email delivery over Ethereal SMTP with zero in-memory locks or counters.
4. **PostgreSQL & Prisma (`prisma/schema.prisma`)**:
   - Authoritative source of truth for users, senders, campaigns, email jobs, and integration tokens with database-level uniqueness constraints.
5. **Redis (`@reachinbox/shared`)**:
   - Powers BullMQ queues, atomic sliding-window rate limit counters, inter-email delay reservations, and Slack alert deduplication locks.
6. **Elasticsearch (`@reachinbox/shared`)**:
   - Best-effort full-text search index for sent and scheduled emails; degrades gracefully if the cluster is unreachable.

---

## 2. Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide Icons |
| **Backend API** | Node.js 20, Express, Zod, Helmet, `express-rate-limit`, `jose`, Bull Board |
| **Worker Engine** | BullMQ 5, Node.js 20, Nodemailer, Ethereal SMTP, IORedis |
| **Authoritative DB** | PostgreSQL 16 (or Supabase), Prisma ORM 5.22 |
| **Distributed Cache/Queue** | Redis 7 (or Upstash / Memorystore / ElastiCache) |
| **Search Engine** | Elasticsearch 8.13.4 (`@elastic/elasticsearch`) |
| **External Integrations** | Google OAuth 2.0, Slack API OAuth 2.0 & Webhooks, Ethereal Email SMTP |
| **Tooling & Monorepo** | pnpm 9 workspaces, Docker, Docker Compose, TypeScript 5.5, ESLint, Prettier |

---

## 3. Core Guarantees & Distributed Strategies

### Idempotency & Crash Recovery Guarantee

#### Why "Strict Exactly-Once SMTP Delivery" Is a Distributed Fallacy
In distributed systems communicating over SMTP (RFC 5321), absolute physical "exactly-once delivery" cannot be guaranteed:
1. Network partitions or process crashes can occur *after* the remote SMTP server accepts the message payload but *before* the sending client receives the `250 OK` acknowledgment packet.
2. If retried, duplicate delivery occurs; if discarded, messages are lost.

#### Application-Level Deduplication Architecture
1. **Client Request Idempotency**:
   - Every email job generates a deterministic `idempotencyKey` computed from `hash(userId, senderEmail, recipientEmail, subject, body, scheduledAt)`.
   - PostgreSQL enforces a **`UNIQUE` constraint** on `email_jobs.idempotencyKey`. Client retries or duplicate batch submissions safely return idempotent replays without queue or database duplication.
2. **Atomic Worker State Transition**:
   - Before dispatching over SMTP, the worker executes an atomic SQL transition:
     ```sql
     UPDATE email_jobs
     SET status = 'PROCESSING', "updatedAt" = NOW()
     WHERE id = :emailJobId AND status IN ('SCHEDULED', 'RESCHEDULED');
     ```
   - If multiple workers receive the same job simultaneously, only one worker transitions the row.
3. **Recovery After Worker Interruption**:
   - If a worker crashes before dispatch, the recovery scan atomically reclaims the job and increments `retryCount`.
   - If a worker crashes after SMTP send but before PostgreSQL update, the recorded `messageId` prevents duplicate dispatch.
   - Built-in startup reconciliation and a periodic 2-minute watchdog automatically restore missing BullMQ jobs from PostgreSQL.
   - Standalone CLI available via `pnpm recover:jobs`.

---

### Concurrency & Distributed Minimum Delay Strategy

- **Worker Concurrency (`WORKER_CONCURRENCY`)**: Configurable worker pool (default: `5`) that processes distinct jobs in parallel across multiple worker containers.
- **Distributed Delay Pacing (`MIN_EMAIL_DELAY_MS`)**: Configurable minimum spacing (default: `2000ms`) between consecutive emails.
- **Per-Sender Isolation**: Delay slots are tracked per sender mailbox (`email-delay:sender:{senderId}`) via atomic Redis Lua scripts. Multi-tenant mailboxes never cause head-of-line blocking for one another.
- **Adaptive Inline Waiting vs. Rescheduling**:
  - Delays $\le 10\text{s}$: Worker pauses asynchronously and delivers inline.
  - Delays $> 10\text{s}$: Job is automatically rescheduled back to BullMQ with the required delay, immediately releasing the worker thread for other senders.

---

### Distributed Hourly Rate Limiting & Zero-Loss Rescheduling

- **Hourly Rate Limiter**: Enforces `MAX_EMAILS_PER_HOUR_PER_SENDER` (default: `200`), with database campaign-level overrides taking precedence.
- **Atomic Window Counters**: Evaluated using Redis atomic Lua scripts on sliding UTC hourly keys (`email-rate:{senderId}:{hourWindow}`).
- **Zero-Loss Rescheduling Flow**:
  1. When an hourly quota is hit, the email job is **never dropped** and **never marked failed**.
  2. The next available hourly window is calculated.
  3. PostgreSQL status updates to `RESCHEDULED` with the new `scheduledAt`.
  4. The job is placed back into BullMQ with a calculated delay to the start of the next hour.
  5. The worker is immediately freed to process emails for other senders.
  6. On transient SMTP delivery failures, the consumed token is decremented (`DECR`) to protect sender quota.

---

## 4. Local Development Setup

### Prerequisites
- **Node.js**: `v20.x` or higher
- **pnpm**: `v9.x` (`corepack enable && corepack prepare pnpm@9.7.1 --activate`)
- **Docker & Docker Compose**: For local PostgreSQL, Redis, and Elasticsearch

### Quickstart Guide

```bash
# 1. Clone the repository and navigate to the project directory
cd main_project

# 2. Install all workspace dependencies
pnpm install

# 3. Create your local environment file
cp .env.example .env

# 4. Start local infrastructure (Postgres, Redis, Elasticsearch)
pnpm docker:up

# 5. Push Prisma schema to local PostgreSQL
pnpm db:push

# 6. Start development servers concurrently
# Terminal 1: Backend Express API (port 4000)
pnpm dev:api

# Terminal 2: BullMQ Worker Engine
pnpm dev:worker

# Terminal 3: Next.js Frontend Portal (port 3000)
pnpm dev:web
```

### Verification & Test Suite

```bash
# Run unit and integration tests across monorepo
pnpm test

# Run TypeScript typechecks
pnpm typecheck

# Run ESLint across all projects
pnpm lint

# Run manual orphan job reconciliation scan
pnpm recover:jobs

# Verify setup integrity
pnpm verify:setup
```

---

## 5. Production Deployment Guide

### A. Next.js Frontend Deployment (Vercel)
1. Push your repository to GitHub / GitLab.
2. In Vercel, import the repository and set **Root Directory** to `main_project/apps/web`.
3. Vercel automatically detects `apps/web/vercel.json`.
4. Configure environment variable:
   - `NEXT_PUBLIC_API_URL`: `https://api.yourdomain.com`

---

### B. Express REST API Deployment (Google Cloud Run)
1. Deploy `apps/api` using its production Dockerfile:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/reachinbox-api -f apps/api/Dockerfile .
   gcloud run deploy reachinbox-api \
     --image gcr.io/YOUR_PROJECT_ID/reachinbox-api \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars "NODE_ENV=production,PORT=4000,DATABASE_URL=...,REDIS_URL=...,JWT_SECRET=..."
   ```

---

### C. BullMQ Worker Deployment (Google Cloud Run Background Service)
1. Deploy `apps/worker` using its production Dockerfile:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/reachinbox-worker -f apps/worker/Dockerfile .
   gcloud run deploy reachinbox-worker \
     --image gcr.io/YOUR_PROJECT_ID/reachinbox-worker \
     --platform managed \
     --region us-central1 \
     --no-allow-unauthenticated \
     --min-instances 1 \
     --set-env-vars "NODE_ENV=production,DATABASE_URL=...,REDIS_URL=...,WORKER_CONCURRENCY=10"
   ```

---

### D. Managed Services Configuration
- **PostgreSQL**: Supabase, AWS RDS, or Google Cloud SQL (set `DATABASE_URL` and `DIRECT_URL`).
- **Redis**: Upstash Redis, AWS ElastiCache, or Google Memorystore (set `REDIS_URL`).
- **Elasticsearch**: Elastic Cloud (set `ELASTICSEARCH_URL`, `ELASTICSEARCH_USERNAME`, and `ELASTICSEARCH_PASSWORD`).

---

## 6. Monorepo Directory Structure

```text
main_project/
├── apps/
│   ├── api/                     # Express REST API
│   │   ├── Dockerfile           # Multi-stage production container
│   │   ├── src/
│   │   │   ├── app.ts           # App factory with Helmet, CORS, Rate Limiters
│   │   │   ├── server.ts        # Server entry point
│   │   │   ├── config/env.ts    # Zod fail-fast environment schema
│   │   │   ├── controllers/     # Auth, Email, Sender, Slack controllers
│   │   │   ├── middleware/      # Auth session, Rate limiter, HTTP error handlers
│   │   │   ├── routes/          # Express route definitions
│   │   │   └── validators/      # Zod validation schemas with HTML sanitization
│   │   └── test/                # Automated API test suite
│   ├── web/                     # Next.js 14 Web Frontend
│   │   ├── vercel.json          # Monorepo Vercel build configuration
│   │   ├── src/
│   │   │   ├── app/             # App Router pages (compose, scheduled, sent, settings)
│   │   │   ├── components/      # Auth shell, compose form, table views, toasts
│   │   │   └── lib/             # API client & CSV recipient validator
│   └── worker/                  # BullMQ Background Worker
│       ├── Dockerfile           # Multi-stage production container
│       ├── src/
│       │   ├── index.ts         # Bootstrapper with reconciliation & graceful shutdown
│       │   ├── worker.ts        # BullMQ Worker instance
│       │   ├── processors/      # Idempotent email processing logic
│       │   └── services/        # Ethereal SMTP delivery service
│       └── test/                # Automated Worker test suite
├── packages/
│   └── shared/                  # Core shared libraries
│       ├── src/
│       │   ├── constants/       # Queues, jobs, defaults
│       │   ├── db/              # Prisma client singleton & lifecycle
│       │   ├── queue/           # BullMQ queue, delay coordinator, rate limiter, recovery
│       │   ├── search/          # Elasticsearch client and query service
│       │   └── utils/           # AES-256-GCM token encryption, sanitization, validation
├── docker/                      # Infrastructure compose definitions
│   └── docker-compose.yml       # Postgres, Redis, Elasticsearch
├── prisma/
│   └── schema.prisma            # Authoritative database models
└── scripts/
    ├── recover-orphaned-jobs.ts # CLI reconciliation tool
    └── verify-setup.js          # Workspace prerequisite checker
```

---

## 7. Feature Matrix & Assignment Mapping

| Requirement | Implementation Details | Status |
| :--- | :--- | :---: |
| **No Cron Jobs** | BullMQ delayed jobs (`queue.add('send-email', data, { delay })`) stored in persistent Redis. Zero cron libraries used. | Complete |
| **Relational Database** | PostgreSQL via Prisma (`prisma/schema.prisma`) acts as authoritative source of truth for users, campaigns, senders, and jobs with Row Level Security enabled. | Complete |
| **Fake SMTP (Ethereal)** | Nodemailer integrated with Ethereal SMTP credentials; generates live preview URLs on delivery. | Complete |
| **Worker Concurrency** | Configurable via `WORKER_CONCURRENCY` (set to `5` in `apps/worker/src/config/env.ts`). | Complete |
| **Delay Between Emails** | Configurable minimum delay via `MIN_EMAIL_DELAY_MS` (`2000ms`). Coordinated via Redis atomic delay reservations. | Complete |
| **Hourly Rate Limiting** | Configurable `MAX_EMAILS_PER_HOUR_PER_SENDER` (`200/hr`). Backed by Redis sliding window counters (`consumeHourlyRateLimit`). When limit is reached, jobs are **rescheduled to the next hour window** (never dropped/failed). | Complete |
| **Live Slack Notification** | Full OAuth 2.0 flow (`/api/integrations/slack/connect`). On rate limit hit, decrypts stored token and posts live alert to the user's Slack channel with deduplication. | Complete |
| **Server Restart Survival** | Worker startup reconciliation scan (`reconcileScheduledJobsOnStartup`) queries PostgreSQL for missing/pending jobs and re-enqueues them with accurate remaining delays. | Complete |
| **Elasticsearch Search** | Emails indexed to Elasticsearch on schedule/delivery, queryable via `/api/emails/search?q=...` with automatic PostgreSQL fallback. | Complete |
| **Live BullMQ Dashboard** | Bull Board mounted at `/admin/queues` displaying active, delayed, waiting, and completed job metrics with admin authentication. | Complete |
| **Google OAuth Login** | Real Google OAuth 2.0 flow (`/api/auth/google`) with session cookies, profile extraction, and logout. | Complete |
| **Dashboard & Figma Match** | Next.js 14 frontend with Sidebar/Header showing user Avatar, Name, Email, Logout, Compose modal/page, and Scheduled & Sent tabs. | Complete |
| **Compose New Email** | Subject, Body, CSV/text lead upload with email detection counter, multi-recipient chip parser with collapse/expand, start time picker, delay, and hourly limit controls. | Complete |
| **Scheduled & Sent Tables** | Paginated tables displaying recipient, status badge with timestamp, subject preview, star action, slide-over detail drawer with Ethereal preview link. | Complete |

---

## 8. Short Demo Video Guide (Under 5 Minutes)

Here is a recommended script for recording the 5-minute video demonstration:

### Step 1: Authentication & Workspace (0:00 - 0:45)
1. Open the web app at `http://localhost:3000` (or deployed URL).
2. Click **"Continue with Google"** and complete OAuth.
3. Show the landing dashboard with the sidebar displaying:
   - User account avatar, name, and email.
   - Compose pill button.
   - Core tabs: **Scheduled** (`◷`) and **Sent** (`✈`) with live count badges.

### Step 2: Compose & Multi-Recipient Scheduling (0:45 - 2:00)
1. Navigate to **Compose**.
2. Select or enter a sender email.
3. Paste a list of space/comma-separated recipient emails (or click **"Upload List"** to upload a CSV file). Show that recipients parse into clean chips with the counter indicator (`N recipients detected`).
4. Set Subject and Body.
5. Set:
   - **Delay between 2 emails**: `2` sec
   - **Hourly Limit**: `200`
   - **Start Time**: Click the Clock icon to select a time 1–2 minutes in the future.
6. Click **Send** & show toast notification confirming batch scheduling.

### Step 3: Inspect Scheduled Jobs & Bull Board (2:00 - 3:00)
1. Click **Scheduled** in the sidebar. Show the newly scheduled jobs appearing with their formatted timestamp badges (`[Tue 9:15:12 AM]`).
2. Open the BullMQ dashboard at `http://localhost:4000/admin/queues` (or deployed `/admin/queues`).
3. Show the `email-send` queue displaying active counts in **Delayed** and **Waiting**.

### Step 4: Server Restart Survival Test (3:00 - 4:00)
1. In your terminal running the worker service, press `Ctrl + C` (or `docker stop reachinbox-worker`) to stop the worker process.
2. Note that the scheduled time is still in the future.
3. Start the worker again (`pnpm dev:worker` or `docker start reachinbox-worker`).
4. Point out the console log:
   ```text
   [RECOVERY_STARTUP] Executing startup reconciliation scan against PostgreSQL...
   [RECOVERY_STARTUP_COMPLETED] Startup reconciliation scan complete
   ```
5. Wait for the scheduled time to arrive: demonstrate that the worker picks up the job at the exact scheduled time and dispatches it over SMTP without duplicate sends.

### Step 5: Sent Dashboard & Ethereal SMTP Preview (4:00 - 5:00)
1. Return to the dashboard and click **Sent**.
2. Show that the emails moved to status `Sent`.
3. Click an email row to open the **Email Detail Drawer**.
4. Click **"Open Mail"** on the Ethereal SMTP Preview card: show the real delivered HTML email rendered in the Ethereal sandbox inbox.
5. (Bonus) Show the **Integrations** page with the connected Slack workspace.

---

## 9. Assumptions, Shortcuts, and Engineering Trade-offs

1. **At-Least-Once Delivery vs. Exactly-Once Delivery**:
   - In distributed systems operating across standard SMTP (RFC 5321), absolute physical "exactly-once delivery" across network boundaries is impossible due to the Two Generals' Problem (a process or network partition can occur after SMTP accepts the message but before sending `250 OK`).
   - We enforce application-level idempotency: deterministic unique keys in PostgreSQL, atomic database state transitions (`SCHEDULED` -> `PROCESSING`), and `messageId` deduplication preventing duplicate SMTP submissions on worker retries.
2. **Elasticsearch with Automatic PostgreSQL Fallback**:
   - Elasticsearch provides high-performance full-text search indexing. However, to guarantee 100% uptime for reviewers who may run without a local Elasticsearch cluster, the search service automatically detects cluster availability and falls back to authoritative PostgreSQL queries without failing user requests.
3. **UTC Hourly Sliding Window**:
   - Rate limiting is keyed by hourly UTC bucket (`YYYY-MM-DD-HH:senderId`) via Redis atomic commands. Jobs exceeding the limit are deferred to the next hourly window rather than failing permanently, preserving order and delivery.
4. **Row Level Security (RLS)**:
   - Supabase PostgreSQL tables have RLS enabled to safeguard direct public API access while allowing trusted server-side connection pool queries.

---

## 10. Submission Checklist

- [x] Monorepo structure with Express API, BullMQ Worker, Next.js Web, and Shared packages.
- [x] Private GitHub repository created.
- [x] Access granted to GitHub user: **`Mitrajit`**.
- [x] README includes full setup instructions, architecture breakdown, feature matrix, and trade-offs.
- [x] Submission form filled: [ClickUp Assignment Submission](https://forms.clickup.com/9005062261/f/8cbwp3n-8876/6NNNJ92DV93PQTAYST).

---

## 11. License

MIT

