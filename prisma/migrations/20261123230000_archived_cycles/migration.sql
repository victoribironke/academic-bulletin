-- Task A2 (work order v2.1, DEC5): archive a cycle whole, tagged TEST, and
-- restore it. Adds three columns only; safe to run more than once.

ALTER TABLE "review_cycles"
  ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedById" TEXT;

-- Check: the three columns.
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'review_cycles' AND column_name IN ('isTest', 'archivedAt', 'archivedById')
ORDER BY column_name;
