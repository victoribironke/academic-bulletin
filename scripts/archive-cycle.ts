/**
 * Archives a whole review cycle, or restores it (work order task A2, DEC5),
 * the same way the Archive button on Review Cycles does.
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/archive-cycle.ts --cycle "<cycle name or id>" --by <admin email> \
 *       [--test] [--restore] [--confirm ARCHIVE|RESTORE]
 *
 * Without --confirm it is a dry run: it shows the cycle, what moves with it
 * and what the dashboard would count. --test tags the cycle TEST. --by names
 * the Academic Planning admin the activity log records. Nothing is deleted;
 * a restored cycle comes back closed. Run it on the test site first.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const cycleArg = option("--cycle");
const by = option("--by")?.trim().toLowerCase();
const restore = args.includes("--restore");
const isTest = args.includes("--test");
const confirmWord = restore ? "RESTORE" : "ARCHIVE";
const confirmed = option("--confirm")?.trim().toUpperCase() === confirmWord;
if (!cycleArg || !by) {
  console.error(
    'Usage: npx tsx scripts/archive-cycle.ts --cycle "<cycle name or id>" --by <admin email> [--test] [--restore] [--confirm ARCHIVE|RESTORE]',
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
// The app's own database client reads this when first imported.
process.env.DATABASE_URL = databaseUrl;

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { NOT_IN_ARCHIVED_CYCLE, archiveCycle, cycleArchiveSummary, restoreCycle } = await import(
    "../lib/cycles/archive"
  );
  try {
    const cycle = await prisma.reviewCycle.findFirst({
      where: { OR: [{ id: cycleArg }, { name: cycleArg }] },
    });
    if (!cycle) throw new Error(`No review cycle is called or has the id "${cycleArg}".`);
    const actor = await prisma.user.findFirst({
      where: { email: { equals: by, mode: "insensitive" }, role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!actor) throw new Error(`${by} isn't an active Academic Planning admin on this site.`);

    const counted = () => prisma.submission.count({ where: NOT_IN_ARCHIVED_CYCLE });
    const summary = await cycleArchiveSummary(cycle.id);
    console.log(
      [
        `Cycle: ${cycle.name} (${cycle.id})`,
        `  ${cycle.isActive ? "active" : "closed"}${cycle.isTest ? ", tagged TEST" : ""}${cycle.archivedAt ? `, archived ${cycle.archivedAt.toISOString()}` : ", not archived"}`,
        `  ${summary.drafts} drafts, ${summary.comments} comments, ${summary.transitions} workflow steps, ${summary.logEntries} log entries`,
        `Drafts the dashboard counts now: ${await counted()}`,
        `Recorded as done by: ${actor.firstName} ${actor.lastName}`,
      ].join("\n"),
    );

    if (!confirmed) {
      console.log(
        `\nDry run: nothing changed. To ${restore ? "restore" : `archive${isTest ? " and tag it TEST" : ""}`}, add --confirm ${confirmWord}.`,
      );
      return;
    }

    const result = restore
      ? await restoreCycle({ cycleId: cycle.id, actorId: actor.id })
      : await archiveCycle({ cycleId: cycle.id, actorId: actor.id, isTest });
    if (!result.ok) throw new Error(result.message);
    const after = await prisma.reviewCycle.findUniqueOrThrow({ where: { id: cycle.id } });
    console.log(
      [
        `\n${restore ? "Restored" : "Archived"}: ${after.name}`,
        `  ${after.isActive ? "active" : "closed"}${after.isTest ? ", tagged TEST" : ""}${after.archivedAt ? `, archived ${after.archivedAt.toISOString()}` : ", not archived"}`,
        `Drafts the dashboard counts now: ${await counted()}`,
      ].join("\n"),
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
