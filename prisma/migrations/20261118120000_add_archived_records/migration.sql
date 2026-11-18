-- The Archive: "Delete" moves a record nobody depends on into this table,
-- whole, instead of erasing it, so an administrator can restore it.
--
-- Additive only. Apply BEFORE deploying the code that uses it. Safe to run
-- more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS "archived_records" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "archivedById" TEXT,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "archived_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "archived_records_archivedById_fkey" FOREIGN KEY ("archivedById")
        REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "archived_records_archivedAt_idx" ON "archived_records"("archivedAt");

COMMIT;
