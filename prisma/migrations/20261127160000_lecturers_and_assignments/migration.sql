-- Task G2: lecturer and committee-member roles, and courses given to
-- lecturers. Adds two role values, one type and one table; safe to run again.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'LECTURER';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'COMMITTEE_MEMBER';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AssignmentStatus') THEN
    CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'READY', 'ACCEPTED', 'RETURNED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "course_assignments" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "lecturerId" TEXT NOT NULL,
  "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "note" TEXT,
  "assignedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_assignments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "course_assignments_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "course_assignments_lecturerId_fkey" FOREIGN KEY ("lecturerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "course_assignments_courseId_key" ON "course_assignments"("courseId");
CREATE INDEX IF NOT EXISTS "course_assignments_lecturerId_idx" ON "course_assignments"("lecturerId");
CREATE INDEX IF NOT EXISTS "course_assignments_submissionId_idx" ON "course_assignments"("submissionId");
