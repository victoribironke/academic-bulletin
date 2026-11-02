ALTER TYPE "UserRole" ADD VALUE 'PROGRAMME_COORDINATOR';

ALTER TABLE "master_courses"
ADD COLUMN "curriculumSource" TEXT,
ADD COLUMN "sourceReference" TEXT,
ADD COLUMN "sourceProgrammes" JSONB;

ALTER TABLE "programme_courses"
ADD COLUMN "titleOverride" TEXT,
ADD COLUMN "unitsOverride" INTEGER,
ADD COLUMN "typeOverride" "CourseType",
ADD COLUMN "semesterOverride" INTEGER,
ADD COLUMN "learningOutcomesOverride" JSONB,
ADD COLUMN "courseContentOverride" TEXT,
ADD COLUMN "sourceProgrammeName" TEXT,
ADD COLUMN "sourceReference" TEXT;

CREATE TABLE "user_programmes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_programmes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_programmes_userId_programmeId_key"
ON "user_programmes"("userId", "programmeId");

CREATE INDEX "user_programmes_programmeId_idx"
ON "user_programmes"("programmeId");

CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");
CREATE INDEX "activity_logs_actorId_createdAt_idx" ON "activity_logs"("actorId", "createdAt");
CREATE INDEX "activity_logs_entityType_entityId_idx" ON "activity_logs"("entityType", "entityId");
CREATE INDEX "activity_logs_action_idx" ON "activity_logs"("action");

ALTER TABLE "user_programmes"
ADD CONSTRAINT "user_programmes_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_programmes"
ADD CONSTRAINT "user_programmes_programmeId_fkey"
FOREIGN KEY ("programmeId") REFERENCES "programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_logs"
ADD CONSTRAINT "activity_logs_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
