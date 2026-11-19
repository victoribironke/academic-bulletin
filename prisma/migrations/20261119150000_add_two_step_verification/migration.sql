-- Two-step verification (authenticator app) for Academic Planning Admins and
-- Super Admins. Only adds columns and tables; nothing existing changes.
-- Every statement can be run again safely, one at a time.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "mfaSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "mfaEnabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mfaLastUsedStep" INTEGER;

CREATE TABLE IF NOT EXISTS "mfa_recovery_codes" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mfa_recovery_codes_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "mfa_verifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_verifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mfa_verifications_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "mfa_recovery_codes_userId_codeHash_key"
  ON "mfa_recovery_codes"("userId", "codeHash");

CREATE UNIQUE INDEX IF NOT EXISTS "mfa_verifications_sessionId_key"
  ON "mfa_verifications"("sessionId");

CREATE INDEX IF NOT EXISTS "mfa_verifications_userId_idx"
  ON "mfa_verifications"("userId");
