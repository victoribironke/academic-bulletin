-- Task H9 (work order v2.1): the Academic Policy library. Versions DAP
-- uploads; earlier ones stay readable. Adds a table only; safe to run more
-- than once.

CREATE TABLE IF NOT EXISTS "policy_versions" (
  "id" TEXT NOT NULL, "label" TEXT NOT NULL, "note" TEXT, "sourceName" TEXT, "content" TEXT NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT false, "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "policy_versions_createdAt_idx" ON "policy_versions"("createdAt");

-- Check: the table and its two indexes.
SELECT to_regclass('public.policy_versions') AS policy_versions,
       (SELECT count(*) FROM pg_indexes WHERE tablename = 'policy_versions') AS indexes;
