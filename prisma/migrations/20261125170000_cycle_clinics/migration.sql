-- Task H8: DAP's weekly online clinics for Heads of Department, with their
-- joining links. Adds one table; safe to run again.
CREATE TABLE IF NOT EXISTS "cycle_clinics" (
  "id" TEXT NOT NULL,
  "cycleId" TEXT NOT NULL,
  "weekday" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "minutes" INTEGER NOT NULL DEFAULT 30,
  "title" TEXT NOT NULL,
  "joinUrl" TEXT NOT NULL,
  "untilDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cycle_clinics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cycle_clinics_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "cycle_clinics_cycleId_idx" ON "cycle_clinics"("cycleId");
