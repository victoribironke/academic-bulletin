-- The workflow ledger (phase_transitions) records who acted in which role and
-- which version of the bulletin's text, and stops being edited after the fact:
-- daily summary emails are tracked in their own table instead of on the row.
--
-- Additive only. Apply BEFORE deploying the code that uses it. The guards that
-- make the ledger append-only are a separate migration, applied AFTER deploy
-- (20261105140100_ledger_guards).
BEGIN;

-- Past rows keep a null role: the role a person held then can't be known now.
ALTER TABLE "phase_transitions"
ADD COLUMN "actorRole" "UserRole",
ADD COLUMN "contentHash" TEXT;

CREATE TABLE "phase_transition_notifications" (
    "transitionId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase_transition_notifications_pkey" PRIMARY KEY ("transitionId")
);

ALTER TABLE "phase_transition_notifications"
ADD CONSTRAINT "phase_transition_notifications_transitionId_fkey"
FOREIGN KEY ("transitionId") REFERENCES "phase_transitions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over what has already been emailed, so nothing is sent twice.
INSERT INTO "phase_transition_notifications" ("transitionId", "notifiedAt")
SELECT "id", "notifiedAt" FROM "phase_transitions" WHERE "notifiedAt" IS NOT NULL;

CREATE INDEX "phase_transitions_transitionedAt_idx"
ON "phase_transitions"("transitionedAt");

COMMIT;
