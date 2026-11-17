-- Phase owners become data, so who may act at each review phase can change
-- (for example when Phases 6 to 9 are assigned) without a code change. The
-- rows seeded here reproduce the current rules exactly: the department at
-- Phase 1, the Dean at Phase 2, Academic Planning from Phase 3 onward.
--
-- Also records the evidence a phase needs to close, such as the Senate minute
-- reference, on the transition that closed it.
BEGIN;

CREATE TABLE "phase_owners" (
    "id" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "role" "UserRole",
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase_owners_pkey" PRIMARY KEY ("id"),
    -- Each row names a role or a single user, never both or neither.
    CONSTRAINT "phase_owners_role_or_user_check"
        CHECK (("role" IS NULL) <> ("userId" IS NULL)),
    CONSTRAINT "phase_owners_phase_check" CHECK ("phase" BETWEEN 1 AND 10)
);

CREATE UNIQUE INDEX "phase_owners_phase_role_key" ON "phase_owners"("phase", "role");
CREATE UNIQUE INDEX "phase_owners_phase_userId_key" ON "phase_owners"("phase", "userId");

ALTER TABLE "phase_owners"
ADD CONSTRAINT "phase_owners_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "phase_owners" ("id", "phase", "role")
SELECT gen_random_uuid()::text, owner.phase, owner.role::"UserRole"
FROM (
    VALUES (1, 'HOD'), (1, 'PROGRAMME_COORDINATOR'), (2, 'DEAN')
) AS owner(phase, role)
UNION ALL
SELECT gen_random_uuid()::text, phase, 'ADMIN'::"UserRole"
FROM generate_series(3, 10) AS phase;

ALTER TABLE "phase_transitions" ADD COLUMN "reference" TEXT;

CREATE INDEX "phase_transitions_submissionId_toPhase_transitionedAt_idx"
ON "phase_transitions"("submissionId", "toPhase", "transitionedAt");

COMMIT;
