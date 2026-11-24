-- Tasks T3 to T6: the reminder agent's messages and DAP's controls. Two new
-- tables; nothing existing changes. Safe to run again. In Railway's query box
-- run one statement at a time (five in all).

CREATE TABLE IF NOT EXISTS "agent_messages" (
    "id" TEXT NOT NULL,
    "deskKey" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "ccIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "forDate" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "facts" JSONB NOT NULL,
    "writtenBy" TEXT NOT NULL,
    "editedById" TEXT,
    "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "agent_messages_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_messages_deskKey_forDate_key" ON "agent_messages"("deskKey", "forDate");

CREATE INDEX IF NOT EXISTS "agent_messages_forDate_status_idx" ON "agent_messages"("forDate", "status");

CREATE INDEX IF NOT EXISTS "agent_messages_recipientId_sentAt_idx" ON "agent_messages"("recipientId", "sentAt");

CREATE TABLE IF NOT EXISTS "agent_controls" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_controls_pkey" PRIMARY KEY ("key")
);
