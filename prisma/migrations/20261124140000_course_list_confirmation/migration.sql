-- Task B10: Heads of Department confirm their course list, or ask DAP for a
-- change. Two new tables; nothing existing changes. Safe to run again.
-- In Railway's query box run one statement at a time (five in all).

CREATE TABLE IF NOT EXISTS "course_list_confirmations" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "courseCount" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    CONSTRAINT "course_list_confirmations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_list_confirmations_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_list_confirmations_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "course_list_confirmations_submissionId_key" ON "course_list_confirmations"("submissionId");

CREATE TABLE IF NOT EXISTS "course_change_requests" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "courseCode" TEXT,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "course_change_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_change_requests_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "course_change_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "course_change_requests_status_requestedAt_idx" ON "course_change_requests"("status", "requestedAt");

CREATE INDEX IF NOT EXISTS "course_change_requests_submissionId_idx" ON "course_change_requests"("submissionId");
