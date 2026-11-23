/**
 * Pre-fills each draft's Course Structure (work order task E1, rule W1):
 * the General Education block of section 6.1 for every level the programme
 * runs, locked, and the programme's courses from package file 02.
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/prefill-course-structures.ts --file <02_...xlsx> \
 *       [--cycle "<cycle name or id>"] [--programme <code>] [--report <file.md>] [--confirm]
 *
 * Without --cycle it plans every programme as if its draft were empty, as a
 * report for DAP; nothing can change. With --cycle it works on that cycle's
 * drafts: a dry run unless --confirm. It only adds rows; a row already in a
 * draft is never changed, so running it again is safe. Run it on the test
 * site first, and only after task A5 (file 02 uses the new codes).
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const file = option("--file");
const cycleArg = option("--cycle");
const onlyProgramme = option("--programme")?.trim().toUpperCase();
const reportPath = option("--report");
const confirm = args.includes("--confirm");
if (!file) {
  console.error(
    'Usage: npx tsx scripts/prefill-course-structures.ts --file <02_...xlsx> [--cycle "<cycle name or id>"] [--programme <code>] [--report <file.md>] [--confirm]',
  );
  process.exit(1);
}
if (confirm && !cycleArg) {
  console.error("--confirm needs --cycle: without a cycle this is a report only.");
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

type Line = string;

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { readStructureWorkbook } = await import("../lib/courses/read-structures");
  const { applyCourseStructure, loadRegistryCourses, planCourseStructure } = await import(
    "../lib/courses/course-structure"
  );
  const { GENERAL_EDUCATION_BLOCK, programmeLevels } = await import("../lib/courses/general-education");
  const { loadCodeLookups } = await import("../lib/units/code-aliases");
  const { formatCourseCode } = await import("../lib/validation/name-format");
  type Plan = ReturnType<typeof planCourseStructure>;

  try {
    const rows = await readStructureWorkbook(file!);
    const lookups = await loadCodeLookups(prisma);
    const programmes = await prisma.programme.findMany({
      select: { id: true, code: true, name: true, duration: true, isNew: true, isHidden: true },
      orderBy: { code: "asc" },
    });
    const programmeById = new Map(programmes.map((programme) => [programme.id, programme]));

    // Match file 02's programme codes to the platform (old codes work, with a warning).
    const rowsByProgramme = new Map<string, typeof rows>();
    const unmatched = new Map<string, number>();
    const aliasWarnings = new Set<string>();
    for (const row of rows) {
      const found = lookups.programme.resolve(row.programmeCode);
      if (!found) {
        unmatched.set(row.programmeCode, (unmatched.get(row.programmeCode) ?? 0) + 1);
        continue;
      }
      if (found.warning) aliasWarnings.add(found.warning);
      rowsByProgramme.set(found.id, [...(rowsByProgramme.get(found.id) ?? []), row]);
    }

    // The drafts to fill: a cycle's editable drafts, or every programme as if empty.
    let cycleName: string | null = null;
    const targets: { programmeId: string; draftId: string | null; status: string | null }[] = [];
    if (cycleArg) {
      const cycle = await prisma.reviewCycle.findFirst({
        where: { OR: [{ id: cycleArg }, { name: cycleArg }] },
        select: { id: true, name: true, archivedAt: true },
      });
      if (!cycle) throw new Error(`No review cycle is called or has the id "${cycleArg}".`);
      if (cycle.archivedAt) throw new Error(`${cycle.name} is in the Archive.`);
      cycleName = cycle.name;
      const drafts = await prisma.submission.findMany({
        where: { cycleId: cycle.id },
        select: { id: true, programmeId: true, status: true },
      });
      for (const draft of drafts) targets.push({ programmeId: draft.programmeId, draftId: draft.id, status: draft.status });
    } else {
      for (const programme of programmes) targets.push({ programmeId: programme.id, draftId: null, status: null });
    }
    const chosen = targets
      .filter((target) => !onlyProgramme || programmeById.get(target.programmeId)?.code === onlyProgramme)
      .sort((a, b) => programmeById.get(a.programmeId)!.code.localeCompare(programmeById.get(b.programmeId)!.code));
    if (onlyProgramme && chosen.length === 0) throw new Error(`No ${cycleArg ? "draft" : "programme"} has the code ${onlyProgramme}.`);

    const registry = await loadRegistryCourses(prisma, [
      ...rows.map((row) => formatCourseCode(row.code)),
      ...GENERAL_EDUCATION_BLOCK.map((course) => course.code),
    ]);
    // Citizenship Orientation past 500 level (BU-GST 061, 062).
    for (const extra of await loadRegistryCourses(prisma, ["BU-GST 061", "BU-GST 062"])) registry.set(extra[0], extra[1]);

    const results: {
      programme: (typeof programmes)[number];
      draftId: string | null;
      levels: number[];
      plan: Plan;
      note: string | null;
      added?: number;
      descriptions?: number;
    }[] = [];
    for (const target of chosen) {
      const programme = programmeById.get(target.programmeId)!;
      const programmeRows = rowsByProgramme.get(programme.id) ?? [];
      const levels = programmeLevels(
        programme.duration,
        programmeRows.map((row) => row.level).filter((level): level is number => typeof level === "number"),
      );
      const editable = target.status === null || target.status === "DRAFT" || target.status === "CORRECTIONS_REQUIRED";
      const existing = target.draftId
        ? await prisma.course.findMany({ where: { submissionId: target.draftId }, select: { code: true, title: true } })
        : [];
      const plan = planCourseStructure({ levels, rows: programmeRows, registry, existing });
      const note = !editable
        ? `Draft is ${target.status}; left alone.`
        : programmeRows.length === 0
          ? programme.isNew
            ? "New programme: General Education block only; its course list comes with file 11."
            : "No rows in file 02: General Education block only."
          : null;
      const result: (typeof results)[number] = { programme, draftId: target.draftId, levels, plan, note };
      if (confirm && target.draftId && editable) {
        const applied = await applyCourseStructure(prisma, { id: target.draftId, programmeId: programme.id }, plan);
        result.added = applied.added;
        result.descriptions = applied.descriptions;
      }
      results.push(result);
    }

    // The report.
    const sum = (pick: (plan: Plan) => number) => results.reduce((total, item) => total + pick(item.plan), 0);
    const notesOf = (kind: string) =>
      results.flatMap((item) =>
        item.plan.notes.filter((note) => note.kind === kind).map((note) => ({ programme: item.programme, note })),
      );
    const mode = !cycleArg ? "Plan for empty drafts (report only)" : confirm ? "Applied" : "Dry run (nothing changed)";
    const lines: Line[] = [
      `# E1 Course Structure pre-fill: ${mode}`,
      "",
      `- When: ${new Date().toISOString()}`,
      `- File: ${file!.split("/").pop()} (${rows.length} rows, ${rowsByProgramme.size} programmes matched)`,
      `- ${cycleArg ? `Cycle: ${cycleName} (${chosen.length} drafts)` : `Programmes: ${chosen.length}`}`,
      `- Rows to add: ${sum((plan) => plan.courses.length)} (${sum((plan) => plan.counts.fromFile)} from file 02, ${sum((plan) => plan.counts.block)} General Education block)`,
      ...(confirm
        ? [`- Rows added: ${results.reduce((total, item) => total + (item.added ?? 0), 0)}; course details started from the Registry: ${results.reduce((total, item) => total + (item.descriptions ?? 0), 0)}`]
        : []),
      `- File 02 General Education rows replaced by the standard block (section 6.1): ${sum((plan) => plan.counts.coveredByBlock)}`,
      "",
      "## For DAP",
      "",
      `- Units missing (rows left out until DAP supplies them): ${notesOf("NO_UNITS").length}`,
      `- General Education courses outside the block (left out until DAP records an exemption): ${notesOf("NEEDS_EXEMPTION").length}`,
      `- Codes listed twice for one programme (first kept): ${notesOf("LISTED_TWICE").length}`,
      `- Rows that aren't course codes or have no valid level or semester: ${notesOf("BAD_ROW").length}`,
      `- Courses not in the Registry yet (added from file 02; linked once the Registry has them): ${notesOf("NOT_IN_REGISTRY").length}`,
      ...(unmatched.size > 0
        ? [`- Programme codes in file 02 that match no programme: ${[...unmatched].map(([code, count]) => `${code} (${count} rows)`).join(", ")}`]
        : []),
      ...[...aliasWarnings].map((warning) => `- ${warning}`),
      "",
    ];
    for (const [kind, heading] of [
      ["NO_UNITS", "Units missing"],
      ["NEEDS_EXEMPTION", "General Education courses outside the block"],
      ["LISTED_TWICE", "Listed twice"],
      ["BAD_ROW", "Rows that can't be used"],
    ] as const) {
      const found = notesOf(kind);
      if (found.length === 0) continue;
      lines.push(`### ${heading}`, "");
      for (const { programme, note } of found) {
        lines.push(`- ${programme.name} (${programme.code}), file 02 row ${note.rowNumber ?? "?"}: ${note.message}`);
      }
      lines.push("");
    }
    lines.push(
      "## By programme",
      "",
      "| Programme | Code | Levels | File 02 rows | Add from file 02 | Add General Education | Not in Registry yet | Already in draft | Left out | Note |",
      "|---|---|---|---|---|---|---|---|---|---|",
    );
    for (const item of results) {
      const counts = item.plan.counts;
      const notInRegistry = item.plan.notes.filter((note) => note.kind === "NOT_IN_REGISTRY").length;
      lines.push(
        `| ${item.programme.name}${item.programme.isNew ? " (new)" : ""} | ${item.programme.code} | ${item.levels[0]}-${item.levels[item.levels.length - 1]} | ${counts.fileRows} | ${counts.fromFile} | ${counts.block} | ${notInRegistry} | ${counts.alreadyInDraft} | ${counts.skipped} | ${item.note ?? ""} |`,
      );
    }
    const report = `${lines.join("\n")}\n`;
    if (reportPath) {
      writeFileSync(reportPath, report);
      console.log(`Report written to ${reportPath}`);
    }
    console.log(lines.slice(0, lines.indexOf("## By programme")).join("\n"));
    if (!confirm) console.log(cycleArg ? "Dry run: nothing changed. Add --confirm to fill the drafts." : "Report only: nothing changed.");
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
