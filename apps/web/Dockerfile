FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.7.1 --activate

# =========================
# Dependencies
# =========================
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile
RUN pnpm prisma generate --schema=prisma/schema.prisma

# =========================
# Builder
# =========================
FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY prisma ./prisma/
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

COPY apps/web/package.json ./apps/web/
COPY apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY apps/web/next.config.* ./apps/web/
COPY apps/web/postcss.config.* ./apps/web/
COPY apps/web/tailwind.config.* ./apps/web/
COPY apps/web/public ./apps/web/public/
COPY apps/web/src ./apps/web/src

# Browser-accessible API endpoint (configurable via build args; defaults to local development API)
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter @reachinbox/shared build
RUN pnpm --filter @reachinbox/web build

# =========================
# Production
# =========================
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public

USER node
WORKDIR /app/apps/web

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "-p", "3000"]