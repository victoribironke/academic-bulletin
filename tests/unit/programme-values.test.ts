import { describe, expect, it } from "vitest";
import {
  effectiveCourseValues,
  planProgrammeValues,
  programmeValueProblem,
  programmeValuesReport,
  readProgrammeValueRows,
} from "@/lib/courses/programme-values";
import { planCourseStructure } from "@/lib/courses/course-structure";

// Task B14: programme-specific course settings, planned without a database.

const record = (
  programme: string,
  programmeCode: string,
  code: string,
  field: string,
  registry: number | string,
  uses: number | string,
) => ({
  Programme: programme,
  "Programme Code": programmeCode,
  "Course Code": code,
  "Course Title": `${code} title`,
  Field: field,
  "Registry value": registry,
  "This programme uses": uses,
  Rule: "Store the programme value on the programme link (task B14).",
});

const programmes = [
  { id: "p-eco", code: "VSSS-ECO-ECO", name: "Economics" },
  { id: "p-cys", code: "SOCO-IFT-CYS", name: "Cybersecurity" },
  { id: "p-pbh", code: "SAHS-PBH-PBH", name: "Public Health" },
];
const courses = [
  { id: "c-eco405", code: "ECO 405", title: "Economic Planning", units: 2, semester: 1, level: 400 },
  { id: "c-csc308", code: "CSC 308", title: "Operating Systems", units: 3, semester: 1, level: 300 },
  { id: "c-gst021", code: "BU-GST 021", title: "Citizenship Orientation", units: 0, semester: 1, level: 200 },
  { id: "c-gst440", code: "BU-GST 440", title: "E-Project Management", units: 2, semester: 1, level: 400 },
];

describe("effectiveCourseValues (B14)", () => {
  const master = { units: 3, semester: 1, level: 300, type: "CORE" as const };

  it("uses the Registry's values when the programme has none", () => {
    expect(effectiveCourseValues(master, null)).toEqual({ units: 3, semester: 1, level: 300, status: "CORE" });
  });

  it("uses the programme's own values where it has them", () => {
    expect(
      effectiveCourseValues(master, { unitsOverride: 2, semesterOverride: null, levelOverride: 400, isCore: false }),
    ).toEqual({ units: 2, semester: 1, level: 400, status: "ELECTIVE" });
  });

  it("lets the same code be 2 units in one programme and 3 in another", () => {
    const here = effectiveCourseValues(master, { unitsOverride: 2 });
    const there = effectiveCourseValues(master, {});
    expect([here.units, there.units]).toEqual([2, 3]);
  });
});

describe("reading package file 09", () => {
  it("reads units, semester and level rows", () => {
    const { rows, notes } = readProgrammeValueRows([
      record("Economics", "VSSS-ECO-ECO", "eco405", "Units", 2, 3),
      record("Public Health", "SAHS-PBH-PBH", "BU-GST 021", "Level", 200, 100),
      record("Christian Theology", "JSEH-REL-CTH", "BU-GST 440", "Semester", "1", "2"),
    ]);
    expect(notes).toEqual([]);
    expect(rows.map((row) => [row.rowNumber, row.courseCode, row.field, row.registryValue, row.programmeValue])).toEqual([
      [2, "ECO 405", "UNITS", 2, 3],
      [3, "BU-GST 021", "LEVEL", 200, 100],
      [4, "BU-GST 440", "SEMESTER", 1, 2],
    ]);
  });

  it("turns rows it can't use into notes", () => {
    const { rows, notes } = readProgrammeValueRows([
      record("Economics", "VSSS-ECO-ECO", "ECO 405", "Title", 2, 3),
      record("Economics", "VSSS-ECO-ECO", "ECO 405", "Semester", 1, 3),
      record("Economics", "VSSS-ECO-ECO", "ECO 405", "Level", 400, 450),
      record("Economics", "VSSS-ECO-ECO", "", "Units", 2, 3),
    ]);
    expect(rows).toEqual([]);
    expect(notes.map((note) => note.kind)).toEqual(["BAD_ROW", "BAD_ROW", "BAD_ROW", "BAD_ROW"]);
    expect(notes[1].message).toContain("semester 1 or 2");
  });

  it("checks each field's range", () => {
    expect(programmeValueProblem("UNITS", 13)).toContain("0 to 12");
    expect(programmeValueProblem("UNITS", 0)).toBeNull();
    expect(programmeValueProblem("LEVEL", 700)).toBeNull();
    expect(programmeValueProblem("SEMESTER", null)).toContain("whole number");
  });
});

describe("planProgrammeValues", () => {
  const plan = (records: ReturnType<typeof record>[], links: Parameters<typeof planProgrammeValues>[0]["links"] = []) => {
    const { rows, notes } = readProgrammeValueRows(records);
    return planProgrammeValues({ rows, notes, programmes, courses, links });
  };

  it("stores the programme's value on its link, adding the link when there is none", () => {
    const result = plan(
      [
        record("Economics", "VSSS-ECO-ECO", "ECO 405", "Units", 2, 3),
        record("Cybersecurity", "SOCO-IFT-CYS", "CSC 308", "Level", 300, 400),
      ],
      [{ id: "l1", programmeId: "p-eco", courseId: "c-eco405", unitsOverride: null }],
    );
    expect(result.counts).toEqual({ fileRows: 2, matched: 2, codeErrors: 0 });
    expect(result.changes.map((change) => [change.programmeCode, change.code, change.field, change.current, change.next, change.newLink])).toEqual([
      ["VSSS-ECO-ECO", "ECO 405", "UNITS", null, 3, false],
      ["SOCO-IFT-CYS", "CSC 308", "LEVEL", null, 400, true],
    ]);
  });

  it("is a no-op the second time", () => {
    const result = plan(
      [record("Economics", "VSSS-ECO-ECO", "ECO 405", "Units", 2, 3)],
      [{ id: "l1", programmeId: "p-eco", courseId: "c-eco405", unitsOverride: 3 }],
    );
    expect(result.changes).toEqual([]);
    expect(result.alreadySet).toBe(1);
  });

  it("finds a programme by name or an old code, and a course in any spacing", () => {
    const { rows } = readProgrammeValueRows([
      record("Economics", "OLD-ECO", "ECO405", "Units", 2, 3),
      record("Public Health", "", "bu-gst 021", "Level", 200, 100),
    ]);
    const result = planProgrammeValues({
      rows,
      programmes,
      resolveProgrammeCode: (code) => (code === "OLD-ECO" ? "p-eco" : undefined),
      courses,
      links: [],
    });
    expect(result.counts.codeErrors).toBe(0);
    expect(result.changes.map((change) => [change.programmeCode, change.code])).toEqual([
      ["VSSS-ECO-ECO", "ECO 405"],
      ["SAHS-PBH-PBH", "BU-GST 021"],
    ]);
  });

  it("counts unknown programmes, unknown courses and shared codes as code errors", () => {
    const { rows } = readProgrammeValueRows([
      record("Astronomy", "ZZZ-AST-AST", "ECO 405", "Units", 2, 3),
      record("Economics", "VSSS-ECO-ECO", "ECO 999", "Units", 2, 3),
      record("Economics", "VSSS-ECO-ECO", "PHY 316", "Units", 2, 3),
    ]);
    const result = planProgrammeValues({
      rows,
      programmes,
      courses: [
        ...courses,
        { id: "c-phy-a", code: "PHY316", title: "A", units: 2, semester: 1, level: 300 },
        { id: "c-phy-b", code: "PHY-316", title: "B", units: 2, semester: 1, level: 300 },
      ],
      links: [],
    });
    expect(result.notes.map((note) => note.kind)).toEqual(["NO_PROGRAMME", "NO_COURSE", "SAME_CODE_TWICE"]);
    expect(result.counts.codeErrors).toBe(3);
    expect(result.changes).toEqual([]);
  });

  it("stores nothing where the Registry already has the programme's value, and clears an old value", () => {
    const result = plan(
      [record("Economics", "VSSS-ECO-ECO", "ECO 405", "Units", 3, 2)],
      [{ id: "l1", programmeId: "p-eco", courseId: "c-eco405", unitsOverride: 4 }],
    );
    expect(result.notes.map((note) => note.kind)).toEqual(["REGISTRY_DIFFERS", "SAME_AS_REGISTRY"]);
    expect(result.changes.map((change) => [change.current, change.next])).toEqual([[4, null]]);
  });

  it("keeps the first of two rows for the same value", () => {
    const result = plan([
      record("Economics", "VSSS-ECO-ECO", "ECO 405", "Units", 2, 3),
      record("Economics", "VSSS-ECO-ECO", "ECO 405", "Units", 2, 4),
    ]);
    expect(result.changes.map((change) => change.next)).toEqual([3]);
    expect(result.notes[0].message).toContain("kept row 2");
  });

  it("writes a report DAP can read", () => {
    const report = programmeValuesReport(
      plan([record("Economics", "VSSS-ECO-ECO", "ECO 405", "Units", 2, 3)]),
      "Programme-specific course values (B14): dry run",
    );
    expect(report).toContain("| 2 | VSSS-ECO-ECO Economics | ECO 405 Economic Planning | units | 2 | 3 | no link yet |");
    expect(report).toContain("Rows with code errors: 0");
  });
});

describe("the draft pre-fill uses the programme's own values (E1 with B14)", () => {
  it("puts General Education rows where the programme runs them", () => {
    const result = planCourseStructure({
      levels: [100, 200, 300, 400],
      rows: [],
      registry: new Map(),
      existing: [],
      programmeValues: new Map([
        ["BU-GST 021", { units: null, semester: null, level: 100 }],
        ["BU-GST 440", { units: null, semester: 2, level: null }],
      ]),
    });
    const row = (code: string) => result.courses.find((course) => course.code === code);
    expect(row("BU-GST 021")?.level).toBe(100);
    expect(row("BU-GST 440")?.semester).toBe(2);
    expect(row("BU-GST 022")?.level).toBe(200);
  });

  it("falls back to the programme's units when file 02 has none", () => {
    const result = planCourseStructure({
      levels: [400],
      rows: [{ rowNumber: 2, programmeCode: "VSSS-ECO-ECO", programmeName: "Economics", level: 400, semester: 1, code: "ECO 405", title: "Economic Planning", units: null, status: "C", option: null }],
      registry: new Map([["ECO 405", { id: "c-eco405", code: "ECO 405", title: "Economic Planning", units: 2, semester: 1, prerequisites: [] }]]),
      existing: [],
      programmeValues: new Map([["ECO 405", { units: 3, semester: null, level: null }]]),
    });
    expect(result.courses.find((course) => course.code === "ECO 405")?.units).toBe(3);
  });
});
