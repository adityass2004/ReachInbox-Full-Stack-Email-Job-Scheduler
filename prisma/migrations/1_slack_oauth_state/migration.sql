CREATE TABLE
    "slack_oauth_states" (
        "stateHash" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "slack_oauth_states_pkey" PRIMARY KEY ("stateHash")
    );

CREATE INDEX "slack_oauth_states_userId_idx" ON "slack_oauth_states" ("userId");

CREATE INDEX "slack_oauth_states_expiresAt_idx" ON "slack_oauth_states" ("expiresAt");

ALTER TABLE "slack_oauth_states" ADD CONSTRAINT "slack_oauth_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;