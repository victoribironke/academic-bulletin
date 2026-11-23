-- Task D4 (work order v2.1): acting on a phase you do not own is an override
-- with a written reason, kept on the ledger row and flagged. Adds one empty
-- column; the ledger stays append-only. Safe to run more than once.

ALTER TABLE "phase_transitions" ADD COLUMN IF NOT EXISTS "phaseOverride" JSONB;

-- Check: the column exists.
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'phase_transitions' AND column_name = 'phaseOverride';
