-- Task D11 (work order v2.1, DEC18): "Remember this device for 30 days".
-- One table of remembered browsers (only a hash of each token is stored).
-- Adds a table only; safe to run more than once.

CREATE TABLE IF NOT EXISTS "mfa_trusted_devices" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3), "userAgent" TEXT,
  CONSTRAINT "mfa_trusted_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mfa_trusted_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "mfa_trusted_devices_tokenHash_key" ON "mfa_trusted_devices"("tokenHash");
CREATE INDEX IF NOT EXISTS "mfa_trusted_devices_userId_idx" ON "mfa_trusted_devices"("userId");

-- Check: the table and its two indexes.
SELECT to_regclass('public.mfa_trusted_devices') AS trusted_devices,
       (SELECT count(*) FROM pg_indexes WHERE tablename = 'mfa_trusted_devices') AS indexes;
