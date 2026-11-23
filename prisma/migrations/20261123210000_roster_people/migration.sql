-- Tasks D1, D2 and D3 (work order v2.1): what the roster says about each
-- person (title, WhatsApp number, acting), and when they were invited, first
-- signed in and were last active. Adds empty columns only; safe to run more
-- than once.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "whatsapp" TEXT,
  ADD COLUMN IF NOT EXISTS "isActing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstSignInAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3);

-- Check: six new columns.
SELECT count(*) AS new_columns FROM information_schema.columns
 WHERE table_name = 'users' AND column_name IN ('title', 'whatsapp', 'isActing', 'invitedAt', 'firstSignInAt', 'lastActiveAt');
