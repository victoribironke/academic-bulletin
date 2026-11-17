-- Per-person counts for the endpoints that call the AI service (GRACE checks
-- and photo reviews), so every server instance shares one limit. Rows expire
-- after their one-minute window and the daily job removes them.
--
-- Additive only. Apply BEFORE deploying the code that uses it: that code
-- refuses AI checks it can't count. Safe to run more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS "api_rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_rate_limits_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "api_rate_limits_expiresAt_idx" ON "api_rate_limits"("expiresAt");

COMMIT;
