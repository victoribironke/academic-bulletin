/**
 * Tidies the Registry's stored course titles (work order task B4): acronyms
 * and Roman numerals as written ("ICT", "II"), all-capital titles in title
 * case, and course codes typed into titles ("(gst 212)") taken out.
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/tidy-course-titles.ts [--report <file.md>] [--confirm]
 *
 * Without --confirm it is a dry run that lists every change. Only titles
 * change; codes, units and links stay as they are. Run it on the test site
 * first.
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const reportPath = option("--report");
const confirm = args.includes("--confirm");

const databaseUrl = (process.env.DATABASE_URL_FILE
  ? readFileSync(process.env.DATABASE_URL_FILE, "utf8")
  : (process.env.DATABASE_URL ?? "")
).trim();
if (!databaseUrl) {
  console.error("Set DATABASE_URL_FILE (or DATABASE_URL).");
  process.exit(1);
}
process.env.DATABASE_URL = databaseUrl;

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { cleanCourseTitle } = await import("../lib/validation/name-format");
  const { recordActivity } = await import("../lib/activity-log");
  try {
    const masters = await prisma.masterCourse.findMany({ select: { id: true, code: true, title: true }, orderBy: { code: "asc" } });
    const changes = masters
      .map((master) => ({ ...master, tidy: cleanCourseTitle(master.title, master.code) }))
      .filter((master) => master.tidy && master.tidy !== master.title);
    const codeRemoved = changes.filter((change) => change.tidy.length < change.title.replace(/\s+/g, " ").trim().length - 3);

    const lines = [
      `# B4 course title tidy: ${confirm ? "Applied" : "Dry run (nothing changed)"}`,
      "",
      `- When: ${new Date().toISOString()}`,
      `- Registry courses: ${masters.length}; titles to change: ${changes.length} (of which a typed code taken out: ${codeRemoved.length})`,
      "",
      "| Code | Now | Becomes |",
      "|---|---|---|",
      ...changes.map((change) => `| ${change.code} | ${change.title.replace(/\|/g, "\\|")} | ${change.tidy.replace(/\|/g, "\\|")} |`),
      "",
    ];
    if (reportPath) writeFileSync(reportPath, `${lines.join("\n")}\n`);
    console.log(lines.slice(0, 4).join("\n"));
    for (const change of changes.slice(0, 15)) console.log(`  ${change.code}: "${change.title}" -> "${change.tidy}"`);
    if (changes.length > 15) console.log(`  ... and ${changes.length - 15} more${reportPath ? ` (all in ${reportPath})` : ""}`);

    if (!confirm) {
      console.log("\nDry run: nothing changed. Add --confirm to change the titles.");
      return;
    }
    for (const change of changes) {
      await prisma.masterCourse.update({ where: { id: change.id }, data: { title: change.tidy } });
    }
    await recordActivity({
      action: "REGISTRY_TITLES_TIDIED",
      entityType: "MASTER_COURSE",
      description: `Tidied ${changes.length} Registry course titles (acronyms, Roman numerals, typed codes; task B4).`,
      metadata: { changed: changes.length },
    });
    console.log(`\nChanged ${changes.length} titles.`);
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
