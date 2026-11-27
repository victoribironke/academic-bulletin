-- Task F4: DAP lets a course past the GRACE gate with a reason. Adds one
-- table; safe to run again.
CREATE TABLE IF NOT EXISTS "grace_exemptions" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "grantedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "grace_exemptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grace_exemptions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "grace_exemptions_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "grace_exemptions_courseId_key" ON "grace_exemptions"("courseId");
