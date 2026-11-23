-- Task F0 (work order v2.1): "Submit to School" stays off until a cycle's
-- submissions open (Monday, December 14, 2026 for the 2027-2031 cycle).
-- Empty means no limit, so existing cycles behave as before.
-- Safe to run more than once.

ALTER TABLE "review_cycles" ADD COLUMN IF NOT EXISTS "submissionsOpenAt" TIMESTAMP(3);

-- Check: the column exists.
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'review_cycles' AND column_name = 'submissionsOpenAt';
