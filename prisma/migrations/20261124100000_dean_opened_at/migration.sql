-- Task D5 (work order v2.1): a department can recall a submitted programme
-- only until the Dean opens it. Records when the Dean first opened it.
-- Adds a column only; safe to run more than once.

ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "openedByDeanAt" TIMESTAMP(3);

-- Check: the column.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'submissions' AND column_name = 'openedByDeanAt';
