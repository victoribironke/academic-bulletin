/**
 * The database side of the launch tests (work order section 13, tests 1, 7,
 * 10 and 17; launch checklist, section 14). Read-only: it never writes.
 *
 *   DATABASE_URL_FILE=<file holding the database URL> \
 *     npx tsx scripts/launch-checks.ts [--package <import package folder>] [--report <file.md>]
 *
 * Run it on the test site, and on the live site after A3. Each check prints
 * PASS, FAIL or NOT YET (a part that belongs to a later release). Dates are
 * worked out with a pretend clock, exactly as the screens do; the parts that
 * need a person signing in are listed in docs/golive/LAUNCH_TESTS.md.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const packageDir = option("--package") ?? "../ABRS Import Package (November 20, 2026)";
const reportPath = option("--report");

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

type Result = { test: string; check: string; outcome: "PASS" | "FAIL" | "NOT YET"; detail: string };

/** A moment in West Africa Time. */
const wat = (local: string) => new Date(`${local}+01:00`);

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { loadActiveCycleCalendar, deskCountdown } = await import("../lib/calendar/desk");
  const { generalEducationBlockFor, isGeneralEducationCode, programmeLevels } = await import("../lib/courses/general-education");
  const { COURSE_CODE_PATTERN } = await import("../lib/validation/name-format");
  const { loadCodeLookups } = await import("../lib/units/code-aliases");
  const { planCodeStandard, planHasChanges, readPlatformSnapshot } = await import("../lib/units/code-standard");
  const { readCodeStandard } = await import("../lib/units/read-code-standard");
  const { planRegistryUpload, planIsReady } = await import("../lib/imports/registry-upload");
  const { parseSpreadsheetBuffer } = await import("../lib/imports/spreadsheet");
  const { applyOwnerDefaults } = await import("../lib/imports/owner-defaults");

  const results: Result[] = [];
  const record = (test: string, check: string, ok: boolean | "NOT YET", detail: string) =>
    results.push({ test, check, outcome: ok === "NOT YET" ? "NOT YET" : ok ? "PASS" : "FAIL", detail });

  try {
    // ---- Tests 1 and 7: dates, as a Head of Department's screen works them out.
    const calendar = await loadActiveCycleCalendar();
    if (!calendar) {
      record("1, 7", "The real cycle and its calendar are loaded", false, "No active cycle with a calendar (A3 and C1).");
    } else {
      const department = await prisma.department.findFirst({ select: { id: true, schoolId: true } });
      const head = { id: "launch-check", role: "HOD" as const, departmentId: department?.id ?? null, schoolId: department?.schoolId ?? null, programmeIds: [] };
      const on = (local: string, cal = calendar) => deskCountdown(cal, head, wat(local));

      const launch = on("2026-11-26T08:00:00");
      record("1", `Thursday, November 26, 2026: "70 days left" and "CP1 in 15 days" (${calendar.cycleName})`,
        launch?.headline === "70 days left" && Boolean(launch?.nextLine?.startsWith("Next: CP1 ") && launch.nextLine.endsWith("(15 days)")),
        `${launch?.headline ?? "no countdown"}; ${launch?.nextLine ?? "no next checkpoint"}`);

      const late = on("2027-02-04T23:58:00");
      const after = on("2027-02-05T00:00:00");
      record("7", "11:58 pm on Thursday, February 4, 2027: due today", late?.headline === "Due today at 11:59 pm", late?.headline ?? "no countdown");
      record("7", "12:00 am on Friday, February 5, 2027: overdue by 1 day", after?.headline === "Overdue by 1 day", after?.headline ?? "no countdown");

      const christmas = on("2026-12-28T10:00:00");
      const breakLoaded = calendar.calendar.breaks.some((period) => period.from <= "2026-12-24" && period.to >= "2027-01-03");
      record("7", "During the Christmas break the countdown runs and the break is loaded (no working days)",
        christmas?.headline === "38 days left" && breakLoaded,
        `${christmas?.headline ?? "no countdown"}; ${christmas?.workingDaysLine ?? ""}; break ${breakLoaded ? "loaded" : "missing"}`);
      record("7", "Nothing is sent during the break", "NOT YET", "The reminder agent (T3) comes in R1; today the daily job sends only invitations.");

      // A department extension, worked out in memory (nothing is written).
      const extended = department
        ? on("2027-02-05T00:00:00", {
            ...calendar,
            extensions: [...calendar.extensions, { scope: "DEPARTMENT", targetId: department.id, phase: 1, newDueAt: "2027-02-11" }],
          })
        : null;
      record("7", "A department extension to February 11, 2027 takes precedence",
        extended?.headline === "6 days left" && extended.extendedLine === "Extended to Thursday, February 11, 2027",
        `${extended?.headline ?? "no countdown"}; ${extended?.extendedLine ?? "no extension line"}`);
    }

    // ---- Test 10: the course registry and the drafts.
    const masters = await prisma.masterCourse.findMany({ select: { code: true, title: true, units: true, semester: true } });
    const byKey = new Map<string, string[]>();
    for (const course of masters) {
      const key = course.code.toUpperCase().replace(/\s+/g, "");
      byKey.set(key, [...(byKey.get(key) ?? []), course.code]);
    }
    const duplicates = [...byKey.values()].filter((codes) => codes.length > 1);
    const offFormat = masters.filter((course) => !COURSE_CODE_PATTERN.test(course.code));
    record("10", "No duplicate codes", duplicates.length === 0,
      `${duplicates.length} codes exist in two forms (${duplicates.slice(0, 5).map((codes) => codes.join(" / ")).join("; ")}${duplicates.length > 5 ? "; ..." : ""}); ${offFormat.length} codes not in the standard format. ${duplicates.length > 0 && duplicates.length === offFormat.length ? "These are the groups in the B3 merge report, waiting for DAP's decision." : "Run B3 (npm run courses:clean-codes)."}`);
    const codes = new Set(masters.map((course) => course.code));
    record("10", '"GST 112" and "BU-GST 112" both exist', codes.has("GST 112") && codes.has("BU-GST 112"),
      masters.filter((course) => ["GST 112", "BU-GST 112"].includes(course.code)).map((course) => `${course.code} ${course.title}`).join("; ") || "missing");
    const zeroUnits = masters.filter((course) => course.units === 0).length;
    const sessional = masters.filter((course) => course.semester === null).length;
    record("10", "0-unit and sessional courses are in the Registry", zeroUnits > 0 && sessional > 0, `${zeroUnits} with 0 units; ${sessional} sessional`);

    const cycle = await prisma.reviewCycle.findFirst({ where: { isActive: true, archivedAt: null }, orderBy: { startedAt: "desc" }, select: { id: true, name: true } });
    const drafts = cycle
      ? await prisma.submission.findMany({
          where: { cycleId: cycle.id },
          select: { programme: { select: { code: true, name: true, duration: true, isNew: true } }, courses: { select: { code: true, level: true } } },
        })
      : [];
    if (drafts.length === 0) {
      record("10", "Every programme's course list covers every level of its length", false, "No drafts in an active cycle yet (A3).");
    } else {
      const gaps = drafts.flatMap((draft) => {
        const levels = programmeLevels(draft.programme.duration);
        const have = new Set(draft.courses.map((course) => course.level));
        const missing = levels.filter((level) => !have.has(level));
        return missing.length ? [`${draft.programme.name} (${missing.join(", ")})`] : [];
      });
      record("10", `Every programme's course list covers every level of its length (${drafts.length} drafts in ${cycle!.name})`, gaps.length === 0,
        gaps.length ? `Missing levels: ${gaps.join("; ")}` : "All levels covered.");
      const blockGaps = drafts.flatMap((draft) => {
        const block = generalEducationBlockFor(programmeLevels(draft.programme.duration));
        const have = new Set(draft.courses.filter((course) => isGeneralEducationCode(course.code)).map((course) => course.code));
        const missing = block.filter((course) => !have.has(course.code));
        return missing.length ? [`${draft.programme.name} (${missing.length} missing)`] : [];
      });
      record("10", "Every draft has the General Education block (locked by code, W1)", blockGaps.length === 0,
        blockGaps.length ? blockGaps.join("; ") : `Complete in all ${drafts.length} drafts.`);
    }

    // ---- Test 17: the code and name standard (A5).
    const standard = await readCodeStandard(join(packageDir, "10_Code_Standard_Schools_Departments_Programmes.xlsx"));
    const plan = planCodeStandard(standard, await readPlatformSnapshot(prisma));
    record("17", "Every school, department and programme has its section 1.1 code and name", !planHasChanges(plan),
      planHasChanges(plan) ? "The code standard still has changes to make (A5 not applied here)." : "Nothing left to change.");
    const departments = await prisma.department.findMany({ select: { code: true } });
    const oldDepartmentCodes = departments.filter((item) => /-(HND|PHY)$/.test(item.code)).map((item) => item.code);
    record("17", "No department code ends in HND or PHY", oldDepartmentCodes.length === 0, oldDepartmentCodes.join(", ") || "None.");
    const lookups = await loadCodeLookups(prisma);
    const found = ["SEH", "VASS", "SST"].map((code) => ({ code, found: lookups.school.resolve(code) }));
    record("17", 'The old school codes "SEH", "VASS" and "SST" still find the renamed school',
      found.every((item) => item.found?.id && item.found.warning),
      found.map((item) => `${item.code}: ${item.found ? "found" : "not found"}`).join("; "));
    const alias = await prisma.codeAlias.findFirst({ where: { kind: "DEPARTMENT", validUntil: { gt: new Date() } }, select: { oldCode: true, newCode: true } });
    if (alias) {
      const oldCodePlan = await planRegistryUpload([
        { "Course Code": "ZZZ 101", "Course Title": "Launch Check Course", Units: 2, "Course Type": "CORE", Ownership: "DEPARTMENT", Level: 100, Semester: 1, "Owner Department Code": alias.oldCode },
      ]);
      record("17", "An upload using an old code is accepted with a warning naming the new code (planned only)",
        planIsReady(oldCodePlan) && oldCodePlan.codeWarnings.some((warning) => warning.warnings.some((text) => text.includes(alias.newCode))),
        oldCodePlan.codeWarnings.flatMap((warning) => warning.warnings).join(" ") || "No warning.");
    } else {
      record("17", "An upload using an old code is accepted with a warning naming the new code", false, "No old codes kept as aliases (A5 not applied here).");
    }
    for (const file of [
      "01A_Registry_Upload_Babcock-specific_courses_part1.xlsx",
      "01A_Registry_Upload_Babcock-specific_courses_part2.xlsx",
      "07_Retry_after_fixes_77_skipped_rows_v2_owners_filled.xlsx",
    ]) {
      const { rows } = applyOwnerDefaults(await parseSpreadsheetBuffer(readFileSync(join(packageDir, file))));
      const filePlan = await planRegistryUpload(rows, { keepExistingWhenEmpty: true });
      const codeErrors = filePlan.ownerIssues.length + filePlan.invalid.length;
      record("17", `${file} uploads with no code errors (planned only)`, codeErrors === 0,
        codeErrors ? `${codeErrors} rows to fix` : `${filePlan.courses.length} rows clean`);
    }
    record("17", "Package file 09 uploads with no code errors", "NOT YET", "File 09 holds programme-specific values, loaded with B14 in R1.");
  } finally {
    await prisma.$disconnect();
  }

  const width = Math.max(...results.map((result) => result.check.length));
  console.log(`Launch checks on ${host}\n`);
  for (const result of results) {
    console.log(`${result.outcome.padEnd(7)} Test ${result.test.padEnd(5)} ${result.check.padEnd(width)}  ${result.detail}`);
  }
  const count = (outcome: Result["outcome"]) => results.filter((result) => result.outcome === outcome).length;
  console.log(`\n${count("PASS")} passed, ${count("FAIL")} failed, ${count("NOT YET")} not yet due.`);
  if (reportPath) {
    writeFileSync(
      reportPath,
      [
        "# Launch checks (database side)",
        "",
        `- Database: ${host}`,
        `- When: ${new Date().toISOString()}`,
        `- ${count("PASS")} passed, ${count("FAIL")} failed, ${count("NOT YET")} not yet due (a later release)`,
        "",
        "| Result | Test | Check | Detail |",
        "|---|---|---|---|",
        ...results.map((result) => `| ${result.outcome} | ${result.test} | ${result.check.replace(/\|/g, "\\|")} | ${result.detail.replace(/\|/g, "\\|")} |`),
        "",
      ].join("\n"),
    );
    console.log(`Report: ${reportPath}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
