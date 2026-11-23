-- Task C1 (work order v2.1, section 4): the cycle calendar. Phases,
-- checkpoints, extensions, holidays and quiet periods for each cycle, plus
-- its time zone, due time, working week and quiet hours. Adds columns and
-- tables only; changes no data. Safe to run more than once.

ALTER TABLE "review_cycles"
  ADD COLUMN IF NOT EXISTS "bulletinPeriod" TEXT,
  ADD COLUMN IF NOT EXISTS "defaultDueTime" TEXT NOT NULL DEFAULT '23:59',
  ADD COLUMN IF NOT EXISTS "quietHours" JSONB,
  ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
  ADD COLUMN IF NOT EXISTS "workingWeek" TEXT[] DEFAULT ARRAY['MON', 'TUE', 'WED', 'THU', 'FRI']::TEXT[];

CREATE TABLE IF NOT EXISTS "cycle_phases" (
  "id" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "phase" INTEGER NOT NULL, "name" TEXT NOT NULL,
  "label" TEXT NOT NULL, "scope" TEXT NOT NULL, "desk" TEXT NOT NULL, "opensAt" DATE,
  "formalOpensAt" DATE, "targetAt" DATE, "dueAt" DATE, "anchor" TEXT, "baselineOpensAt" DATE,
  "baselineDueAt" DATE, "hardStop" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "cycle_phases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cycle_phases_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "cycle_checkpoints" (
  "id" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "phase" INTEGER NOT NULL, "code" TEXT NOT NULL,
  "name" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'CHECKPOINT', "dueAt" DATE NOT NULL, "targetAt" DATE,
  "sections" INTEGER[] DEFAULT ARRAY[]::INTEGER[], "requires" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "desks" TEXT[] DEFAULT ARRAY[]::TEXT[], "hardStop" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "cycle_checkpoints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cycle_checkpoints_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "cycle_extensions" (
  "id" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "scope" TEXT NOT NULL, "targetId" TEXT NOT NULL,
  "phase" INTEGER, "checkpointCode" TEXT, "newDueAt" DATE NOT NULL, "reason" TEXT NOT NULL,
  "approvedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cycle_extensions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cycle_extensions_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "cycle_holidays" (
  "id" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "date" DATE NOT NULL, "name" TEXT NOT NULL,
  CONSTRAINT "cycle_holidays_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cycle_holidays_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "cycle_quiet_periods" (
  "id" TEXT NOT NULL, "cycleId" TEXT NOT NULL, "fromDate" DATE NOT NULL, "toDate" DATE NOT NULL, "label" TEXT NOT NULL,
  CONSTRAINT "cycle_quiet_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cycle_quiet_periods_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "cycle_phases_cycleId_phase_key" ON "cycle_phases"("cycleId", "phase");
CREATE UNIQUE INDEX IF NOT EXISTS "cycle_checkpoints_cycleId_code_key" ON "cycle_checkpoints"("cycleId", "code");
CREATE INDEX IF NOT EXISTS "cycle_extensions_cycleId_targetId_idx" ON "cycle_extensions"("cycleId", "targetId");
CREATE UNIQUE INDEX IF NOT EXISTS "cycle_holidays_cycleId_date_key" ON "cycle_holidays"("cycleId", "date");

-- Check: five tables and the cycle's calendar columns.
SELECT to_regclass('public.cycle_phases') AS phases, to_regclass('public.cycle_checkpoints') AS checkpoints,
       to_regclass('public.cycle_extensions') AS extensions, to_regclass('public.cycle_holidays') AS holidays,
       to_regclass('public.cycle_quiet_periods') AS quiet_periods,
       (SELECT count(*) FROM information_schema.columns WHERE table_name = 'review_cycles'
         AND column_name IN ('bulletinPeriod', 'defaultDueTime', 'quietHours', 'timezone', 'workingWeek')) AS cycle_columns;
