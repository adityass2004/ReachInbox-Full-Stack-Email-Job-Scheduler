CREATE TABLE
    "google_oauth_states" (
        "stateHash" TEXT NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "google_oauth_states_pkey" PRIMARY KEY ("stateHash")
    );

CREATE INDEX "google_oauth_states_expiresAt_idx" ON "google_oauth_states" ("expiresAt");