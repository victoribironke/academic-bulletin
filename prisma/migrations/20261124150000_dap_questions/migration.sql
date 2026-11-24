-- Task H6: Ask DAP. One new table; nothing existing changes. Safe to run
-- again. In Railway's query box run one statement at a time (three in all).

CREATE TABLE IF NOT EXISTS "dap_questions" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "field" TEXT,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "answer" TEXT,
    "askedById" TEXT NOT NULL,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "officerId" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    CONSTRAINT "dap_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dap_questions_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "dap_questions_askedById_fkey" FOREIGN KEY ("askedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "dap_questions_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "dap_questions_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "dap_questions_status_dueAt_idx" ON "dap_questions"("status", "dueAt");

CREATE INDEX IF NOT EXISTS "dap_questions_submissionId_idx" ON "dap_questions"("submissionId");
