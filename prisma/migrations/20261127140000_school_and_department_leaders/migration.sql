-- Task E4: the Dean's title, name and photo on the school, and the Head of
-- Department's on the department, entered once for every programme.
-- Adds six empty columns; safe to run again.
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "deanTitle" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "deanName" TEXT;
ALTER TABLE "schools" ADD COLUMN IF NOT EXISTS "deanImageUrl" TEXT;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "hodTitle" TEXT;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "hodName" TEXT;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "hodImageUrl" TEXT;
