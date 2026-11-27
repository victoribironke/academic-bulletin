-- Task F1: the "Please check" warnings a Head accepted, with their reason.
-- Adds one table; safe to run again.
CREATE TABLE IF NOT EXISTS "check_acceptances" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "checkKey" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "acceptedById" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "check_acceptances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "check_acceptances_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "check_acceptances_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "check_acceptances_submissionId_checkKey_key" ON "check_acceptances"("submissionId", "checkKey");
