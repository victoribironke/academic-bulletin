/**
 * Uploads Registry courses from the import package (work order tasks B2,
 * B13, B16 and B17), with the same rules as Course Registry, Bulk upload:
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/upload-registry.ts --by <admin email> \
 *       --file <01A part 1.xlsx> --file <01A part 2.xlsx> --file <07 v2.xlsx> \
 *       --held-back <03_Exceptions_and_Conflicts.xlsx> \
 *       [--report <file.md>] [--confirm]
 *
 * Files are read from their first sheet ("Upload"), in the order given;
 * --held-back reads file 03's "Not uploaded" sheet and fills in its owner
 * and type defaults (lib/imports/held-back-courses.ts). Without --confirm it
 * is a dry run that lists every new course, every change to an existing one
 * and every row to fix. Nothing is written unless every file is clean.
 *
 * Unlike the upload screen, an empty description, outcomes or content cell
 * keeps what an existing course already has. Run it after A5 (the files use
 * the new codes), on the test site first.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const files = args.flatMap((arg, index) => (arg === "--file" && args[index + 1] ? [args[index + 1]] : []));
const heldBack = option("--held-back");
const reportPath = option("--report");
const by = option("--by")?.trim().toLowerCase();
const confirm = args.includes("--confirm");
if (files.length === 0 && !heldBack) {
  console.error(
    "Usage: npx tsx scripts/upload-registry.ts --by <admin email> --file <xlsx> [--file <xlsx> ...] [--held-back <03.xlsx>] [--report <file.md>] [--confirm]",
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

const cell = (value: unknown) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { parseSpreadsheetBuffer } = await import("../lib/imports/spreadsheet");
  const { planRegistryUpload, planIsReady, applyRegistryUpload, preloadAfterUpload, draftsToPreload } = await import(
    "../lib/imports/registry-upload"
  );
  const { convertHeldBackRows, HELD_BACK_SHEET } = await import("../lib/imports/held-back-courses");
  const { applyOwnerDefaults } = await import("../lib/imports/owner-defaults");
  type Plan = Awaited<ReturnType<typeof planRegistryUpload>>;

  try {
    const actor = by ? await prisma.user.findUnique({ where: { email: by }, select: { id: true, role: true } }) : null;
    if (by && (!actor || !["ADMIN", "SUPER_ADMIN"].includes(actor.role))) {
      throw new Error(`${by} is not an Academic Planning admin on ${host}.`);
    }

    const counts = async () => {
      const [courses, babcock, links] = await Promise.all([
        prisma.masterCourse.count(),
        prisma.masterCourse.count({ where: { code: { startsWith: "BU-" } } }),
        prisma.programmeCourse.count(),
      ]);
      return { courses, babcock, links };
    };
    const before = await counts();

    // Each source: a label and its rows (held-back rows converted first).
    const programmes = (
      await prisma.programme.findMany({
        select: { id: true, code: true, name: true, degreeType: true, department: { select: { code: true } } },
      })
    ).map(({ department, ...programme }) => ({ ...programme, departmentCode: department.code }));
    type Source = {
      label: string;
      rows: Record<string, unknown>[];
      notes: { code: string; note: string }[];
      heldBack?: ReturnType<typeof convertHeldBackRows>;
    };
    const sources: Source[] = [];
    for (const file of files) {
      // Rows with no owner get the work order's B6 default, noted in the report.
      const { rows, notes } = applyOwnerDefaults(await parseSpreadsheetBuffer(readFileSync(file)));
      sources.push({ label: basename(file), rows, notes });
    }
    if (heldBack) {
      const converted = convertHeldBackRows(await parseSpreadsheetBuffer(readFileSync(heldBack), HELD_BACK_SHEET), programmes);
      sources.push({ label: `${basename(heldBack)} (${HELD_BACK_SHEET})`, rows: converted.rows, notes: converted.notes, heldBack: converted });
    }

    const lines: string[] = [
      `# Registry upload: ${confirm ? "Applied" : "Dry run (nothing changed)"}`,
      "",
      `- Database: ${host}`,
      `- When: ${new Date().toISOString()}`,
      `- Registry before: ${before.courses} courses (${before.babcock} with BU- codes), ${before.links} programme links`,
      "- An empty description, outcomes or content cell keeps what an existing course already has.",
      ...(confirm ? [] : ["- Each file is planned against the Registry as it is now; with --confirm each is planned again just before it is written."]),
      "",
    ];
    const describe = async (source: Source, plan: Plan) => {
      const { label, heldBack: heldBackInfo } = source;
      const creates = plan.courses.filter((course) => course.action === "create");
      const existing = plan.courses.filter((course) => course.action === "update");
      const updates = existing.filter((course) => course.changes.length > 0);
      const unchanged = existing.length - updates.length;
      const existingLinks = new Set(
        (
          await prisma.programmeCourse.findMany({
            where: { courseId: { in: existing.map((course) => course.existingId!) } },
            select: { courseId: true, programmeId: true },
          })
        ).map((link) => `${link.courseId}:${link.programmeId}`),
      );
      const newLinks = plan.courses.reduce(
        (total, course) =>
          total + course.programmeIds.filter((id) => !course.existingId || !existingLinks.has(`${course.existingId}:${id}`)).length,
        0,
      );
      const drafts = (await draftsToPreload(plan, [...new Set(plan.courses.flatMap((course) => course.programmeIds))])).length;
      const summary = [
        `${plan.rows} rows: ${creates.length} new, ${updates.length} updates, ${unchanged} already up to date, ${plan.skipped.length} repeats skipped`,
        `${newLinks} new programme links`,
        `${plan.invalid.length + plan.ownerIssues.length} rows to fix`,
        ...(heldBackInfo ? [`${heldBackInfo.waiting.length} waiting for DAP`] : []),
        `drafts the upload adds courses to: ${drafts}`,
      ].join("; ");
      console.log(`\n${label}\n  ${summary}`);
      for (const issue of [...plan.invalid, ...plan.ownerIssues].slice(0, 10)) console.log(`  Row ${issue.row}: ${issue.errors.join(" ")}`);

      lines.push(`## ${label}`, "", `- ${summary}`);
      if (plan.unmatchedSourceProgrammes.length) lines.push(`- Source programme names with no programme: ${plan.unmatchedSourceProgrammes.join(", ")}`);
      if (plan.ambiguousSourceProgrammes.length) lines.push(`- Source programme names matching more than one programme: ${plan.ambiguousSourceProgrammes.join(", ")}`);
      lines.push("");
      if (plan.invalid.length + plan.ownerIssues.length > 0) {
        lines.push("### Rows to fix (nothing is written until these are fixed)", "", "| Row | Problem |", "|---|---|");
        for (const issue of [...plan.invalid, ...plan.ownerIssues]) lines.push(`| ${issue.row} | ${cell(issue.errors.join(" "))} |`);
        lines.push("");
      }
      if (heldBackInfo?.waiting.length) {
        lines.push("### Waiting for DAP (not uploaded)", "", "| Code | Title | Why |", "|---|---|---|");
        for (const row of heldBackInfo.waiting) lines.push(`| ${row.code} | ${cell(row.title)} | ${cell(row.reason)} |`);
        lines.push("");
      }
      if (heldBackInfo?.unmatchedProgrammeNames.length) {
        lines.push(`Programme names in the sheet with no programme on the platform: ${heldBackInfo.unmatchedProgrammeNames.join(", ")}`, "");
      }
      if (plan.codeWarnings.length) {
        lines.push("### Old codes used (accepted, A5)", "", "| Row | Warning |", "|---|---|");
        for (const warning of plan.codeWarnings) lines.push(`| ${warning.row} | ${cell(warning.warnings.join(" "))} |`);
        lines.push("");
      }
      if (plan.skipped.length) {
        lines.push("### Repeats skipped", "", "| Row | Code | Note |", "|---|---|---|");
        for (const row of plan.skipped) lines.push(`| ${row.row} | ${row.code} | ${cell(row.note)} |`);
        lines.push("");
      }
      const noteFor = new Map<string, string>();
      for (const note of source.notes) noteFor.set(note.code, [noteFor.get(note.code), note.note].filter(Boolean).join(" "));
      if (updates.length) {
        lines.push(
          "### Existing courses updated",
          "",
          "Text is kept from an empty cell only when the title names the same course.",
          "",
          "| Code | Changes | Kept (empty cell) | Note |",
          "|---|---|---|---|",
        );
        for (const course of updates) {
          lines.push(
            `| ${course.code} | ${cell(course.changes.join("; ") || "no field changes (links only)")} | ${cell(course.kept.join(", "))} | ${cell(noteFor.get(course.code) ?? "")} |`,
          );
        }
        lines.push("");
      }
      if (creates.length) {
        lines.push(
          "### New courses",
          "",
          "| Code | Title | Units | Level | Semester | Owner | Programmes | Note |",
          "|---|---|---|---|---|---|---|---|",
        );
        for (const course of creates) {
          const data = course.data;
          const owner = data.ownership === "INSTITUTIONAL" ? "University-wide" : data.ownerDepartmentCode || data.ownerSchoolCode;
          lines.push(
            `| ${course.code} | ${cell(data.title)} | ${data.units} | ${data.level} | ${data.semester ?? "Sessional"} | ${owner} | ${course.programmeIds.length} | ${cell(noteFor.get(course.code) ?? "")} |`,
          );
        }
        lines.push("");
      }
    };

    // Plan everything first; write nothing unless every file is clean.
    const plans: Plan[] = [];
    for (const source of sources) {
      const plan = await planRegistryUpload(source.rows, { keepExistingWhenEmpty: true });
      plans.push(plan);
      if (!confirm) await describe(source, plan);
    }
    const blocked = sources.filter((_source, index) => !planIsReady(plans[index]));

    if (!confirm) {
      lines.push(blocked.length ? `**Not ready:** ${blocked.map((source) => source.label).join(", ")} have rows to fix.` : "All files are ready to upload.");
      if (reportPath) writeFileSync(reportPath, `${lines.join("\n")}\n`);
      console.log(`\nDry run on ${host}: nothing changed.${blocked.length ? " Fix the rows above first." : " Add --confirm to upload."}`);
      if (reportPath) console.log(`Report: ${reportPath}`);
      return;
    }
    if (blocked.length) throw new Error(`Nothing uploaded: ${blocked.map((source) => source.label).join(", ")} have rows to fix (run without --confirm to see them).`);

    for (const source of sources) {
      const plan = await planRegistryUpload(source.rows, { keepExistingWhenEmpty: true });
      if (!planIsReady(plan)) throw new Error(`Stopped before ${source.label}: it has rows to fix now. The files before it are uploaded.`);
      await describe(source, plan);
      const result = await applyRegistryUpload(plan, { actorId: actor?.id, label: source.label });
      const preloaded = await preloadAfterUpload(plan, result);
      const done = `Uploaded: ${result.created} new, ${result.updated} updated, ${result.unchanged} already up to date, ${result.linked} programme links added, ${preloaded} drafts given the new courses.`;
      console.log(`  ${done}`);
      lines.push(`**${done}**`, "");
    }
    const after = await counts();
    lines.splice(5, 0, `- Registry after: ${after.courses} courses (${after.babcock} with BU- codes), ${after.links} programme links`);
    if (reportPath) writeFileSync(reportPath, `${lines.join("\n")}\n`);
    console.log(`\nRegistry on ${host}: ${before.courses} -> ${after.courses} courses, ${before.babcock} -> ${after.babcock} BU- codes, ${before.links} -> ${after.links} links.`);
    if (reportPath) console.log(`Report: ${reportPath}`);
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
