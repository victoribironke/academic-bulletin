/**
 * Task B18: puts the courses of the newly approved programmes into the
 * Course Registry before their drafts are filled from package file 11.
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/add-new-programme-courses.ts --file <11_...xlsx> --by <admin email> \
 *       [--report <file.md>] [--confirm]
 *
 * Only codes the Registry doesn't have are added. "Courses that exist only in
 * a new programme belong to its department" (work order 6.3): each is owned
 * by the department of the first programme that lists it. Courses already in
 * the Registry keep their owner, title and units; the drafts link to them when
 * scripts/prefill-course-structures.ts runs with file 11. General Education
 * codes are the General Education desk's and are never added here (except an
 * Entrepreneurship programme's own ENT courses, which are the programme's).
 * Runs the same checks as Course Registry, Bulk upload. A dry run unless
 * --confirm.
 */
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const file = option("--file");
const by = option("--by")?.trim().toLowerCase();
const reportPath = option("--report");
const confirm = args.includes("--confirm");
if (!file || !by) {
  console.error("Usage: npx tsx scripts/add-new-programme-courses.ts --file <11_...xlsx> --by <admin email> [--report <file.md>] [--confirm]");
  process.exit(1);
}

const databaseUrl = (process.env.DATABASE_URL_FILE ? readFileSync(process.env.DATABASE_URL_FILE, "utf8") : (process.env.DATABASE_URL ?? "")).trim();
if (!databaseUrl) {
  console.error("Set DATABASE_URL_FILE (or DATABASE_URL).");
  process.exit(1);
}
process.env.DATABASE_URL = databaseUrl;

/** The Entrepreneurship programme teaches ENT courses as its own subject. */
const OWN_ENT_PROGRAMMES = new Set(["SMSC-BAM-ENP"]);
/** New programmes whose file 11 rows came from the national curriculum. */
const CCMAS_PROGRAMMES = new Set(["SMSC-IRM-BIT", "SMSC-BAM-ENP"]);

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { readStructureWorkbook } = await import("../lib/courses/read-structures");
  const { planRegistryUpload, planIsReady, applyRegistryUpload } = await import("../lib/imports/registry-upload");
  const { isGeneralEducationCode, isGeneralEducationFamily } = await import("../lib/courses/general-education");
  const { courseCodeKey } = await import("../lib/courses/code-key");
  const { formatCourseCode, isValidCourseCode } = await import("../lib/validation/name-format");

  try {
    const actor = await prisma.user.findUnique({ where: { email: by }, select: { id: true, role: true } });
    if (!actor || !["ADMIN", "SUPER_ADMIN"].includes(actor.role)) throw new Error(`${by} is not an administrator.`);

    const rows = await readStructureWorkbook(file!);
    const programmes = await prisma.programme.findMany({
      where: { code: { in: [...new Set(rows.map((row) => row.programmeCode.trim().toUpperCase()))] } },
      select: { code: true, name: true, isNew: true, department: { select: { code: true } } },
    });
    const programmeByCode = new Map(programmes.map((programme) => [programme.code, programme]));
    const missingProgrammes = [...new Set(rows.map((row) => row.programmeCode.trim().toUpperCase()))].filter((code) => !programmeByCode.has(code));
    if (missingProgrammes.length) throw new Error(`Not on the platform: ${missingProgrammes.join(", ")}.`);
    const notNew = programmes.filter((programme) => !programme.isNew);
    if (notNew.length) throw new Error(`File 11 is for new programmes only; these are not: ${notNew.map((programme) => programme.code).join(", ")}.`);

    const registry = await prisma.masterCourse.findMany({ select: { code: true } });
    const known = new Set(registry.map((course) => courseCodeKey(course.code)));

    // One Registry row per new code: the first programme that lists it owns it.
    const wanted = new Map<string, { row: (typeof rows)[number]; programmes: string[] }>();
    const skippedGeneral = new Set<string>();
    const invalid: string[] = [];
    for (const row of rows) {
      const code = formatCourseCode(row.code);
      const programmeCode = row.programmeCode.trim().toUpperCase();
      if (!isValidCourseCode(code)) {
        invalid.push(`${programmeCode} row ${row.rowNumber}: "${row.code}"`);
        continue;
      }
      if (isGeneralEducationCode(code) || (isGeneralEducationFamily(code) && !OWN_ENT_PROGRAMMES.has(programmeCode))) {
        skippedGeneral.add(code);
        continue;
      }
      if (known.has(courseCodeKey(code))) continue;
      const entry = wanted.get(code);
      if (entry) {
        if (!entry.programmes.includes(programmeCode)) entry.programmes.push(programmeCode);
      } else {
        wanted.set(code, { row: { ...row, code }, programmes: [programmeCode] });
      }
    }

    const sheet = [...wanted.values()].map(({ row, programmes: codes }) => {
      const owner = programmeByCode.get(codes[0])!;
      // Business Information Technology and Entrepreneurship had no document: their rows are the national curriculum's.
      const fromCcmas = CCMAS_PROGRAMMES.has(codes[0]);
      return {
        "Course Code": row.code,
        "Course Title": row.title,
        Units: row.units,
        "Course Type": row.status === "E" ? "Elective" : "Core",
        Ownership: "Department",
        Level: row.level,
        Semester: row.semester ?? "Sessional",
        "Owner Department Code": owner.department.code,
        "Programme Codes": codes.join(" | "),
        "Curriculum Source": fromCcmas ? "CCMAS 2023" : "Curriculum document for a new programme (B18)",
        "Source Reference": fromCcmas ? "NUC CCMAS 2023 (package file 11)" : "Package file 11 (the programme's curriculum document)",
        "Show in course search": "YES",
      };
    });

    const plan = sheet.length ? await planRegistryUpload(sheet, { keepExistingWhenEmpty: true }) : null;
    const ready = plan ? planIsReady(plan) : true;
    let created = 0;
    if (confirm && plan && ready) {
      const result = await applyRegistryUpload(plan, { actorId: actor.id, label: "B18: courses of the new programmes (package file 11)" });
      created = result.created;
    }

    const byProgramme = new Map<string, string[]>();
    for (const [code, entry] of wanted) byProgramme.set(entry.programmes[0], [...(byProgramme.get(entry.programmes[0]) ?? []), code]);
    const report = [
      `# B18: new programmes' courses into the Course Registry (${confirm ? (ready ? "applied" : "NOT applied: fix the rows below") : "dry run"})`,
      "",
      `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. File: ${file!.split("/").pop()} (${rows.length} rows, ${programmes.length} programmes).`,
      "",
      `- New Registry courses ${confirm && ready ? "added" : "to add"}: ${confirm && ready ? created : wanted.size}, each owned by its programme's department.`,
      `- Courses already in the Registry: linked as they are when the drafts are filled (owner, title and units unchanged).`,
      `- General Education codes left to the General Education desk: ${skippedGeneral.size}.`,
      invalid.length ? `- Rows with no valid course code: ${invalid.join("; ")}.` : "",
      plan && !ready ? `- Rows the upload checks refused: ${plan.invalid.map((item) => `row ${item.row}: ${item.errors.join(" ")}`).join("; ")} ${plan.ownerIssues.map((item) => JSON.stringify(item)).join("; ")}` : "",
      "",
      "| Owning programme (department) | New courses |",
      "|---|---|",
      ...[...byProgramme.entries()].map(([code, codes]) => `| ${code} ${programmeByCode.get(code)!.name} (${programmeByCode.get(code)!.department.code}) | ${codes.length}: ${codes.join(", ")} |`),
      "",
    ]
      .filter((line) => line !== null)
      .join("\n");
    if (reportPath) writeFileSync(reportPath, report);
    console.log(report);
    if (!confirm) console.log("Dry run: nothing changed. Add --confirm to add the courses.");
    if (plan && !ready) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  // The database pool would keep the process open: end it when the work is done.
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
