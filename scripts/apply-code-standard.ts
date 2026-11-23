/**
 * Applies the code and name standard of November 23, 2026 (work order task
 * A5), with the programme records of B15 and B18, from package file 10.
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/apply-code-standard.ts "<path to file 10>" \
 *       [--report <report.md>] [--confirm]
 *
 * Without --confirm it is a dry run: it lists every change and changes
 * nothing. With --confirm it makes them all in one transaction, keeps each
 * old code as an alias until February 4, 2027, records the run in the
 * Activity Log, and writes an after report. Running it again changes nothing.
 * Run it on the test site first.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import {
  applyCodeStandard,
  describeCodeStandardPlan,
  planCodeStandard,
  planHasChanges,
  readPlatformSnapshot,
} from "../lib/units/code-standard";
import { readCodeStandard } from "../lib/units/read-code-standard";

const args = process.argv.slice(2);
const standardPath = args.find((arg) => !arg.startsWith("--") && args[args.indexOf(arg) - 1] !== "--report");
const reportIndex = args.indexOf("--report");
const reportPath = reportIndex >= 0 ? args[reportIndex + 1] : null;
const confirm = args.includes("--confirm");

if (!standardPath) {
  console.error('Usage: npx tsx scripts/apply-code-standard.ts "<path to file 10>" [--report <file.md>] [--confirm]');
  process.exit(1);
}

const databaseUrl = (process.env.DATABASE_URL_FILE
  ? readFileSync(process.env.DATABASE_URL_FILE, "utf8")
  : process.env.DATABASE_URL ?? ""
).trim();
if (!databaseUrl) {
  console.error("Set DATABASE_URL_FILE (or DATABASE_URL).");
  process.exit(1);
}
const host = new URL(databaseUrl).hostname;
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: /^(localhost|127\.0\.0\.1)$/.test(host) ? false : { rejectUnauthorized: false },
  max: 1,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const standard = await readCodeStandard(standardPath!);
  const plan = planCodeStandard(standard, await readPlatformSnapshot(prisma));
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  const before = describeCodeStandardPlan(plan, `Code standard: ${confirm ? "changes made" : "dry run"} on ${host}, ${when} WAT`);

  if (!confirm) {
    if (reportPath) writeFileSync(reportPath, before);
    console.log(before);
    console.log(planHasChanges(plan) ? "\nDry run only: nothing was changed. Run again with --confirm to apply." : "\nNothing to change.");
    return;
  }
  if (!planHasChanges(plan)) {
    console.log("Nothing to change: the platform already follows the standard.");
    return;
  }

  const { changed } = await prisma.$transaction(
    async (tx) => {
      const result = await applyCodeStandard(tx, plan);
      await tx.activityLog.create({
        data: {
          action: "CODE_STANDARD_APPLIED",
          entityType: "CODE_STANDARD",
          description: `Applied the code and name standard of November 23, 2026: ${result.changed} records changed; ${plan.aliases.length} old codes kept as aliases until February 4, 2027.`,
          metadata: {
            schools: plan.schools.filter((c) => c.action !== "unchanged").length,
            departments: plan.departments.filter((c) => c.action !== "unchanged").length,
            programmes: plan.programmes.filter((c) => c.action !== "unchanged").length,
            aliases: plan.aliases.length,
            coursesMoved: plan.courseMoves.reduce((sum, move) => sum + move.courseIds.length, 0),
          },
        },
      });
      return result;
    },
    { timeout: 120_000 },
  );

  // The after report shows the platform as it now stands: nothing left to change.
  const after = planCodeStandard(standard, await readPlatformSnapshot(prisma));
  const report = `${before}\n\n---\n\n${changed} records changed.\n\n${describeCodeStandardPlan(after, "After the run")}`;
  if (reportPath) writeFileSync(reportPath, report);
  console.log(report);
  if (planHasChanges(after)) {
    console.error("Some changes did not take; see the after report.");
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(`Stopped, nothing changed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
