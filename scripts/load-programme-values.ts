/**
 * Task B14: loads package file 09's programme-specific units, semesters and
 * levels onto the links between courses and programmes
 * (lib/courses/programme-values.ts).
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/load-programme-values.ts --file <09_...xlsx> --by <admin email> \
 *       [--report <file.md>] [--confirm]
 *
 * Without --confirm it is a dry run: it writes the report for DAP and
 * changes nothing. With --confirm it sets the values (adding a link where a
 * programme had none) and brings open drafts in line. Nothing is deleted.
 * Run it on the test site first.
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const file = option("--file");
const reportPath = option("--report");
const by = option("--by")?.trim().toLowerCase();
const confirm = args.includes("--confirm");
if (!file || !by) {
  console.error(
    "Usage: npx tsx scripts/load-programme-values.ts --file <09_...xlsx> --by <admin email> [--report <file.md>] [--confirm]",
  );
  process.exit(1);
}

const databaseUrl = (process.env.DATABASE_URL_FILE
  ? readFileSync(process.env.DATABASE_URL_FILE, "utf8")
  : (process.env.DATABASE_URL ?? "")
).trim();
if (!databaseUrl) {
  console.error("Set DATABASE_URL_FILE (or DATABASE_URL).");
  process.exit(1);
}
process.env.DATABASE_URL = databaseUrl;
const host = new URL(databaseUrl).hostname;

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { parseSpreadsheetBuffer } = await import("../lib/imports/spreadsheet");
  const { applyProgrammeValues, planProgrammeValuesFromDatabase, programmeValuesReport } = await import(
    "../lib/courses/programme-values"
  );
  try {
    const actor = await prisma.user.findUnique({ where: { email: by }, select: { id: true, role: true } });
    if (!actor || !["ADMIN", "SUPER_ADMIN"].includes(actor.role)) {
      throw new Error(`${by} is not an Academic Planning admin on ${host}.`);
    }
    const records = await parseSpreadsheetBuffer(readFileSync(file!));
    const plan = await planProgrammeValuesFromDatabase(prisma, records);
    const when = new Date().toISOString();
    const report = programmeValuesReport(
      plan,
      `Programme-specific course values (B14, package file 09): ${confirm ? "applied" : "dry run"} on ${host}, ${when}`,
    );
    if (reportPath) writeFileSync(reportPath, report + "\n");
    console.log(report.split("\n").slice(0, 8).join("\n"));

    if (!confirm) {
      console.log("\nDry run: nothing written. Pass --confirm to apply.");
      return;
    }
    if (plan.changes.length === 0) {
      console.log("\nNothing to change.");
      return;
    }
    const result = await applyProgrammeValues(prisma, plan, { actorId: actor.id });
    console.log(
      `\nApplied: ${result.linksUpdated} links updated, ${result.linksAdded} links added, ${result.draftRowsUpdated} open draft rows brought in line.`,
    );
    const after = await planProgrammeValuesFromDatabase(prisma, records);
    console.log(`Left to store: ${after.changes.length}. Already stored: ${after.alreadySet}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
