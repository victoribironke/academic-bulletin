-- Tasks W2 and W3: contact hours on each course, and named elective groups.
-- Adds two columns, one table and one link; safe to run again.
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "lectureHours" INTEGER;
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "practicalHours" INTEGER;
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "electiveGroupId" TEXT;

CREATE TABLE IF NOT EXISTS "elective_groups" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "chooseUnits" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "elective_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "elective_groups_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "elective_groups_submissionId_name_key" ON "elective_groups"("submissionId", "name");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_electiveGroupId_fkey') THEN
    ALTER TABLE "courses" ADD CONSTRAINT "courses_electiveGroupId_fkey" FOREIGN KEY ("electiveGroupId") REFERENCES "elective_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
