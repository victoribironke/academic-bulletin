/**
 * Task B3: puts every course code in the standard format ("GST 112",
 * "BU-GST 112") and merges Registry courses that then share a code, when
 * their titles and units match (lib/courses/code-cleanup.ts).
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/clean-course-codes.ts --by <admin email> \
 *       [--report <file.md>] [--confirm DELETE]
 *
 * Without --confirm DELETE it is a dry run: it writes the merge report for
 * DAP (groups to decide, merges, codes tidied) and changes nothing. Merging
 * removes the duplicate records (into the Archive), so writing needs
 * --confirm DELETE (work order Appendix D). Run it on the test site first.
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const reportPath = option("--report");
const by = option("--by")?.trim().toLowerCase();
const confirmText = option("--confirm");
if (args.includes("--confirm") && confirmText?.trim().toUpperCase() !== "DELETE") {
  console.error("Writing removes the merged duplicates: pass --confirm DELETE.");
  process.exit(1);
}
const confirm = confirmText?.trim().toUpperCase() === "DELETE";
if (!by) {
  console.error("Usage: npx tsx scripts/clean-course-codes.ts --by <admin email> [--report <file.md>] [--confirm DELETE]");
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
  const { planCodeCleanup, planHasChanges, applyCodeCleanup, codeCleanupReport } = await import(
    "../lib/courses/code-cleanup"
  );
  try {
    const actor = await prisma.user.findUnique({ where: { email: by }, select: { id: true, role: true } });
    if (!actor || !["ADMIN", "SUPER_ADMIN"].includes(actor.role)) {
      throw new Error(`${by} is not an Academic Planning admin on ${host}.`);
    }

    const plan = await planCodeCleanup(prisma);
    const when = new Date().toISOString();
    const report = codeCleanupReport(plan, `Course code clean-up (B3): ${confirm ? "applied" : "dry run"} on ${host}, ${when}`);
    if (reportPath) writeFileSync(reportPath, report + "\n");
    console.log(report.split("\n").slice(0, 10).join("\n"));

    if (!confirm) {
      console.log("\nDry run: nothing written. Pass --confirm DELETE to apply.");
      return;
    }
    if (!planHasChanges(plan)) {
      console.log("\nNothing to change.");
      return;
    }
    const started = Date.now();
    const result = await applyCodeCleanup(plan, { actorId: actor.id }, prisma);
    console.log(
      `\nApplied in ${Math.round((Date.now() - started) / 1000)} s: ${result.renamed} codes tidied, ${result.merged} duplicates merged, ${result.draftRowsRenamed} draft rows tidied.`,
    );
    const after = await planCodeCleanup(prisma);
    console.log(
      `Left: ${after.renames.length} to tidy, ${after.merges.length} to merge, ${after.forDap.length} groups for DAP, ${after.draftRenames.length} draft rows.`,
    );
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
