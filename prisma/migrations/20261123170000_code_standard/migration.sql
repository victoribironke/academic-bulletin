-- Tasks A5, B15 and B18 (work order v2.1): the code and name standard of
-- November 23, 2026, hidden programmes and newly approved programmes.
-- Adds two programme flags and a table of old codes; changes no data.
-- The codes themselves are changed by scripts/apply-code-standard.ts,
-- dry run first. Safe to run more than once.

ALTER TABLE "programmes" ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "programmes" ADD COLUMN IF NOT EXISTS "isNew" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "code_aliases" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "oldCode" TEXT NOT NULL,
  "newCode" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "code_aliases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "code_aliases_kind_oldCode_key" ON "code_aliases"("kind", "oldCode");
CREATE INDEX IF NOT EXISTS "code_aliases_entityId_idx" ON "code_aliases"("entityId");

-- Check: two programme columns and the alias table.
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'programmes' AND column_name IN ('isHidden', 'isNew');
SELECT to_regclass('public.code_aliases') AS alias_table;
