-- An approval that goes ahead although GRACE results haven't passed keeps the
-- reason given and the results it covered on its ledger row.
-- Adds one empty column; existing rows and the append-only guards are
-- untouched, and it is safe to run more than once.
ALTER TABLE "phase_transitions" ADD COLUMN IF NOT EXISTS "graceOverride" JSONB;
