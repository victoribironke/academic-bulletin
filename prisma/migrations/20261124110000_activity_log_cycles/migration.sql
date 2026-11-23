-- Task A4 (work order v2.1): every Activity Log entry belongs to a cycle, so
-- the log opens on the current cycle and test-cycle events stay out of it.
-- Adds a column and an index, then fills the column for earlier entries.
-- Safe to run more than once (it only fills entries that have no cycle).

ALTER TABLE "activity_logs" ADD COLUMN IF NOT EXISTS "cycleId" TEXT;
CREATE INDEX IF NOT EXISTS "activity_logs_cycleId_createdAt_idx" ON "activity_logs"("cycleId", "createdAt");

-- Entries about a draft belong to the draft's cycle.
UPDATE "activity_logs" a SET "cycleId" = s."cycleId"
FROM "submissions" s
WHERE a."cycleId" IS NULL AND a."entityType" = 'SUBMISSION' AND a."entityId" = s."id" AND s."cycleId" IS NOT NULL;

-- Entries about a cycle belong to that cycle.
UPDATE "activity_logs" a SET "cycleId" = c."id"
FROM "review_cycles" c
WHERE a."cycleId" IS NULL AND a."entityType" = 'REVIEW_CYCLE' AND a."entityId" = c."id";

-- Everything else belongs to the cycle that was running when it happened.
UPDATE "activity_logs" a SET "cycleId" = (
  SELECT c."id" FROM "review_cycles" c
  WHERE c."startedAt" <= a."createdAt" AND (c."closedAt" IS NULL OR c."closedAt" >= a."createdAt")
  ORDER BY c."startedAt" DESC LIMIT 1
)
WHERE a."cycleId" IS NULL;

-- Check: entries per cycle (an empty cycleId means no cycle was running).
SELECT coalesce(c."name", '(no cycle)') AS cycle, count(*) AS entries
FROM "activity_logs" a LEFT JOIN "review_cycles" c ON c."id" = a."cycleId"
GROUP BY 1 ORDER BY 2 DESC;
