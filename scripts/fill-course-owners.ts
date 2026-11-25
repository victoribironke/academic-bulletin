/**
 * Task B6: gives every course Babcock offers an owner, a department or a
 * school (lib/courses/course-owners.ts). General Education courses stay with
 * the General Education desk (DEC8).
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/fill-course-owners.ts --by <admin email> [--report <file.md>] [--confirm]
 *
 * Without --confirm it is a dry run: it writes the report for DAP and
 * changes nothing. With --confirm it fills in the owners; an owner that is
 * already set is never changed. Run it on the test site first, and on the
 * live site after A5 and the registry uploads.
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const reportPath = option("--report");
const by = option("--by")?.trim().toLowerCase();
const confirm = args.includes("--confirm");
if (!by) {
  console.error("Usage: npx tsx scripts/fill-course-owners.ts --by <admin email> [--report <file.md>] [--confirm]");
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
  const { applyCourseOwners, courseOwnersReport, planCourseOwnersFromDatabase } = await import("../lib/courses/course-owners");
  try {
    const actor = await prisma.user.findUnique({ where: { email: by }, select: { id: true, role: true } });
    if (!actor || !["ADMIN", "SUPER_ADMIN"].includes(actor.role)) {
      throw new Error(`${by} is not an Academic Planning admin on ${host}.`);
    }
    const plan = await planCourseOwnersFromDatabase(prisma);
    const report = courseOwnersReport(
      plan,
      `Course owners (B6): ${confirm ? "applied" : "dry run"} on ${host}, ${new Date().toISOString()}`,
    );
    if (reportPath) writeFileSync(reportPath, report + "\n");
    console.log(report.split("\n").slice(0, 8).join("\n"));

    if (!confirm) {
      console.log("\nDry run: nothing written. Pass --confirm to apply.");
      return;
    }
    if (plan.changes.length === 0) {
      console.log("\nNothing to fill in.");
      return;
    }
    const result = await applyCourseOwners(prisma, plan, { actorId: actor.id });
    const after = await planCourseOwnersFromDatabase(prisma);
    console.log(`\nApplied: ${result.filled} owners filled in. Left to fill: ${after.changes.length}. Left for DAP: ${after.gaps.length}.`);
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
