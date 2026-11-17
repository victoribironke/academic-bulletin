-- Database guards for the workflow ledger. Apply AFTER the code from the same
-- pull request is deployed: older code edits ledger rows and changes phases
-- without linking a ledger row, and these guards refuse both.
--
-- 1. phase_transitions is append-only: UPDATE and DELETE are refused, which
--    also stops a bulletin with history being deleted.
-- 2. A bulletin's phase or status changes only together with the ledger row
--    that records it. The app names that row in the transaction setting
--    app.ledger_transition just before it updates the bulletin.
--
-- A deliberate data repair can still run inside a transaction that first runs
--   SET LOCAL app.ledger_maintenance = 'on';
-- so it is visible in the migration or script that does it.
BEGIN;

CREATE OR REPLACE FUNCTION ledger_maintenance_enabled() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.ledger_maintenance', true), '') = 'on'
$$;

CREATE OR REPLACE FUNCTION phase_transitions_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF ledger_maintenance_enabled() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'phase_transitions is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS phase_transitions_append_only ON "phase_transitions";
CREATE TRIGGER phase_transitions_append_only
BEFORE UPDATE OR DELETE ON "phase_transitions"
FOR EACH ROW EXECUTE FUNCTION phase_transitions_append_only();

CREATE OR REPLACE FUNCTION submissions_state_requires_ledger() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  entry text := coalesce(current_setting('app.ledger_transition', true), '');
BEGIN
  IF NEW."currentPhase" IS NOT DISTINCT FROM OLD."currentPhase"
     AND NEW."status" IS NOT DISTINCT FROM OLD."status" THEN
    RETURN NEW;
  END IF;
  IF ledger_maintenance_enabled() THEN
    RETURN NEW;
  END IF;
  IF entry = '' OR NOT EXISTS (
    SELECT 1 FROM "phase_transitions"
    WHERE "id" = entry
      AND "submissionId" = NEW."id"
      AND "toPhase" = NEW."currentPhase"
  ) THEN
    RAISE EXCEPTION 'A bulletin''s phase or status can only change with its phase_transitions row'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS submissions_state_requires_ledger ON "submissions";
CREATE TRIGGER submissions_state_requires_ledger
BEFORE UPDATE OF "currentPhase", "status" ON "submissions"
FOR EACH ROW EXECUTE FUNCTION submissions_state_requires_ledger();

COMMIT;
