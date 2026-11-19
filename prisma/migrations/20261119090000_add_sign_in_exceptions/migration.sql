-- Sign-in is limited to babcock.edu.ng Google accounts. A personal account
-- signs in only while a Super Admin's exception lasts, and never in an admin
-- role. Every statement can be run again safely, one at a time.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signInExceptionUntil" TIMESTAMP(3);

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signInExceptionReason" TEXT;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signInExceptionGrantedById" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_signInExceptionGrantedById_fkey'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_signInExceptionGrantedById_fkey"
      FOREIGN KEY ("signInExceptionGrantedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Rollout: active personal accounts outside the admin roles keep signing in
-- for 30 days, so nobody is cut off mid-cycle. Each grant is logged.
-- Prisma stores times as UTC, whatever the database's own time zone is.
WITH granted AS (
  UPDATE "users"
  SET "signInExceptionUntil" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '30 days',
      "signInExceptionReason" = 'Existing account when sign-in was limited to babcock.edu.ng accounts'
  WHERE "isActive"
    AND lower(trim("email")) NOT LIKE '%@babcock.edu.ng'
    AND "role" NOT IN ('ADMIN', 'SUPER_ADMIN')
    AND "signInExceptionUntil" IS NULL
  RETURNING "id", "firstName", "lastName", "signInExceptionUntil", "signInExceptionReason"
)
INSERT INTO "activity_logs" ("id", "actorId", "action", "entityType", "entityId", "description", "metadata", "createdAt")
SELECT
  gen_random_uuid()::text,
  NULL,
  'SIGN_IN_EXCEPTION_GRANTED',
  'USER',
  "id",
  'Gave ' || "firstName" || ' ' || "lastName" || '''s personal Google account a 30-day sign-in exception when sign-in was limited to babcock.edu.ng accounts.',
  jsonb_build_object('until', "signInExceptionUntil", 'reason', "signInExceptionReason", 'rollout', true),
  CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
FROM granted;
