-- Daily summary emails: when a review action was included in a summary.
ALTER TABLE "phase_transitions" ADD COLUMN "notifiedAt" TIMESTAMP(3);

CREATE INDEX "phase_transitions_notifiedAt_transitionedAt_idx"
ON "phase_transitions"("notifiedAt", "transitionedAt");
