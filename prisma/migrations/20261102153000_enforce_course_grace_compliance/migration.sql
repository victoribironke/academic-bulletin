CREATE TYPE "GraceStatus" AS ENUM (
  'PENDING',
  'CHECKING',
  'COMPLIANT',
  'NEEDS_REVISION',
  'ERROR'
);

CREATE TABLE "grace_assessments" (
  "contentHash" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "courseContent" TEXT NOT NULL,
  "learningOutcomes" JSONB,
  "status" "GraceStatus" NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "checkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "grace_assessments_pkey" PRIMARY KEY ("contentHash")
);

ALTER TABLE "course_descriptions"
ADD COLUMN IF NOT EXISTS "gracePass" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "graceResult" JSONB,
ADD COLUMN "graceStatus" "GraceStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "graceContentHash" TEXT,
ADD COLUMN "graceCheckedAt" TIMESTAMP(3);

-- Legacy results have no fingerprint proving that they match the current
-- description, so they are safely queued again when the course is next used.
UPDATE "course_descriptions"
SET "gracePass" = false,
    "graceResult" = NULL;

CREATE INDEX "grace_assessments_status_createdAt_idx"
ON "grace_assessments"("status", "createdAt");

CREATE INDEX "course_descriptions_submissionId_graceStatus_idx"
ON "course_descriptions"("submissionId", "graceStatus");

CREATE INDEX "course_descriptions_graceContentHash_idx"
ON "course_descriptions"("graceContentHash");

ALTER TABLE "course_descriptions"
ADD CONSTRAINT "course_descriptions_graceContentHash_fkey"
FOREIGN KEY ("graceContentHash") REFERENCES "grace_assessments"("contentHash")
ON DELETE SET NULL ON UPDATE CASCADE;
