-- Task G6 (work order v2.1): a course a department removes from its draft
-- must not come back. Each draft remembers the Registry courses it removed.
-- Adds one column with an empty default; changes no data. Safe to run more
-- than once.

ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "dismissedRegistryCourseIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Check: the column exists.
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'submissions' AND column_name = 'dismissedRegistryCourseIds';
