ALTER TABLE "master_courses"
  ADD COLUMN IF NOT EXISTS "learningOutcomes" JSONB,
  ADD COLUMN IF NOT EXISTS "courseContent" TEXT,
  ADD COLUMN IF NOT EXISTS "labWork" TEXT,
  ADD COLUMN IF NOT EXISTS "entrepreneurialAspect" TEXT;
