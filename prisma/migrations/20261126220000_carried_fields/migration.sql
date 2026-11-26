-- E2: fields carried over from the 2023-2027 bulletin, not yet reviewed (V18).
-- Additive and rerunnable.
ALTER TABLE "submission_contents" ADD COLUMN IF NOT EXISTS "carriedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
