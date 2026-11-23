/**
 * Builds or updates the TEST SITE's database (work order task A1), so it has
 * the same tables and the same database rules as the live one. Run it as the
 * test site's pre-deploy step; it is safe to run on every deploy.
 *
 *   APP_ENV=staging DATABASE_URL=... node scripts/prepare-staging-database.mjs
 *
 * It refuses to run unless APP_ENV=staging, so it can never touch the live
 * database by accident.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

if (process.env.APP_ENV?.trim().toLowerCase() !== "staging") {
  console.error("Refusing to run: this script is only for the test site (APP_ENV=staging).");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// 1. Tables, columns and indexes from prisma/schema.prisma. Prisma refuses
//    any change that would lose data, so this never drops anything.
const push = spawnSync("npx", ["prisma", "db", "push"], { stdio: "inherit" });
if (push.status !== 0) {
  console.error("prisma db push failed; the deploy stops here.");
  process.exit(push.status ?? 1);
}

// 2. Database rules the schema can't express, exactly as the live site has
//    them. Each statement is safe to run again.
const ledgerGuards = readFileSync(
  join(process.cwd(), "prisma/migrations/20261105140100_ledger_guards/migration.sql"),
  "utf8",
);
const phaseOwnerChecks = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phase_owners_role_or_user_check') THEN
    ALTER TABLE "phase_owners" ADD CONSTRAINT "phase_owners_role_or_user_check"
      CHECK (("role" IS NULL) <> ("userId" IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'phase_owners_phase_check') THEN
    ALTER TABLE "phase_owners" ADD CONSTRAINT "phase_owners_phase_check"
      CHECK ("phase" BETWEEN 1 AND 10);
  END IF;
END $$;`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(ledgerGuards);
  await client.query(phaseOwnerChecks);
  const { rows } = await client.query(
    `SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  console.log(`Test site database ready: ${rows[0].tables} tables, ledger guards and phase-owner checks in place.`);
} finally {
  await client.end();
}
