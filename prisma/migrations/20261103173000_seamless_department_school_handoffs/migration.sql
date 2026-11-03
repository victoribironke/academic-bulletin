-- Department submissions now move directly into School Approval. Bring only
-- already-submitted phase-1 work forward; drafts and corrections stay put.
BEGIN;

UPDATE "phase_transitions" AS transition
SET "toPhase" = 2
FROM "submissions" AS submission
WHERE transition."submissionId" = submission."id"
  AND submission."currentPhase" = 1
  AND submission."status" = 'IN_REVIEW'
  AND transition."action" = 'SUBMIT'
  AND transition."fromPhase" = 1
  AND transition."toPhase" = 1;

UPDATE "submissions"
SET "currentPhase" = 2
WHERE "currentPhase" = 1
  AND "status" = 'IN_REVIEW';

COMMIT;
