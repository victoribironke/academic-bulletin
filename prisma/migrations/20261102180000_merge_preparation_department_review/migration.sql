-- Preparation (old phase 1) and Departmental Review (old phase 2) now form
-- one stage. All later stages move down by one without changing their meaning.
BEGIN;

UPDATE "submissions"
SET "currentPhase" = CASE
  WHEN "currentPhase" <= 2 THEN 1
  ELSE "currentPhase" - 1
END;

UPDATE "phase_transitions"
SET "fromPhase" = CASE
      WHEN "fromPhase" <= 2 THEN 1
      ELSE "fromPhase" - 1
    END,
    "toPhase" = CASE
      WHEN "toPhase" <= 2 THEN 1
      ELSE "toPhase" - 1
    END;

UPDATE "comments"
SET "phase" = CASE
  WHEN "phase" <= 2 THEN 1
  ELSE "phase" - 1
END;

COMMIT;
