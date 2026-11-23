import { describe, expect, it } from "vitest";
import {
  GENERAL_EDUCATION_BLOCK,
  generalEducationBlockFor,
  isGeneralEducationCode,
  isGeneralEducationCourse,
  isGeneralEducationFamily,
  programmeLevels,
} from "@/lib/courses/general-education";
import { type RegistryCourse, type StructureRow, planCourseStructure } from "@/lib/courses/course-structure";
import { calculateSubmissionProgress } from "@/lib/submissions/progress";

// Task E1 and rule W1: the General Education block and the pre-filled Course Structure.

describe("the General Education block (section 6.1)", () => {
  it("has the section 6.1 table, 32 courses from 100 to 500 level", () => {
    expect(GENERAL_EDUCATION_BLOCK).toHaveLength(32);
    const units = (level: number) =>
      GENERAL_EDUCATION_BLOCK.filter((course) => course.level === level).reduce((total, course) => total + course.units, 0);
    expect([100, 200, 300, 400, 500].map(units)).toEqual([11, 11, 9, 4, 4]);
  });

  it("covers every level the programme runs, with Citizenship Orientation every semester", () => {
    expect(programmeLevels(null)).toEqual([100, 200, 300, 400]);
    expect(programmeLevels(5)).toEqual([100, 200, 300, 400, 500]);
    expect(programmeLevels(4, [100, 600])).toEqual([100, 200, 300, 400, 500, 600]);

    expect(generalEducationBlockFor(programmeLevels(4))).toHaveLength(28);
    expect(generalEducationBlockFor(programmeLevels(5))).toHaveLength(32);
    const sixYears = generalEducationBlockFor(programmeLevels(6));
    expect(sixYears).toHaveLength(34);
    expect(sixYears.filter((course) => course.level === 600).map((course) => course.code)).toEqual([
      "BU-GST 061",
      "BU-GST 062",
    ]);
  });

  it("knows its own codes, and General Education courses outside it", () => {
    expect(isGeneralEducationCode("BU-GST 105")).toBe(true);
    expect(isGeneralEducationCode("ent 211")).toBe(true);
    expect(isGeneralEducationCode("BU-GST 061")).toBe(true);
    expect(isGeneralEducationCode("GST 113")).toBe(false);
    expect(isGeneralEducationCode("ENT 322")).toBe(false);
    expect(isGeneralEducationFamily("ENT 322")).toBe(true);
    expect(isGeneralEducationFamily("BU-GST 420")).toBe(true);
    expect(isGeneralEducationFamily("ACC 101")).toBe(false);
  });

  it("locks a block row by its code even before the Registry has it", () => {
    expect(isGeneralEducationCourse({ code: "BU-GST 126", masterCourse: null })).toBe(true);
    expect(isGeneralEducationCourse({ code: "GST 113", masterCourse: { type: "GST_NUC", ownership: "INSTITUTIONAL" } })).toBe(true);
    expect(isGeneralEducationCourse({ code: "ACC 101", masterCourse: { type: "CORE", ownership: "DEPARTMENT" } })).toBe(false);
  });
});

const row = (overrides: Partial<StructureRow>): StructureRow => ({
  rowNumber: 2,
  programmeCode: "SMSC-ACC-ACC",
  programmeName: "Accounting",
  level: 100,
  semester: 1,
  code: "ACC 101",
  title: "introduction to financial accounting I",
  units: 3,
  status: "C",
  option: null,
  ...overrides,
});
const master = (overrides: Partial<RegistryCourse>): RegistryCourse => ({
  id: "m-acc-101",
  code: "ACC 101",
  title: "Introduction to Financial Accounting I",
  units: 3,
  semester: 1,
  prerequisites: [],
  ...overrides,
});

describe("planning a draft's Course Structure (E1)", () => {
  it("puts the block in first, then the programme's own courses", () => {
    const plan = planCourseStructure({
      levels: [100, 200, 300, 400],
      rows: [
        row({ rowNumber: 2 }),
        row({ rowNumber: 3, code: "ACC 102", title: "Introduction to Financial Accounting II", semester: 2 }),
      ],
      registry: new Map([["ACC 101", master({ prerequisites: ["MTH 101"] })]]),
      existing: [],
    });
    expect(plan.counts).toMatchObject({ block: 28, fromFile: 2, coveredByBlock: 0, skipped: 0 });
    const acc101 = plan.courses.find((course) => course.code === "ACC 101")!;
    expect(acc101).toMatchObject({
      title: "Introduction to Financial Accounting I",
      masterCourseId: "m-acc-101",
      prerequisites: "MTH 101",
      generalEducation: false,
      status: "CORE",
    });
    // Not in the Registry yet: added from file 02 and noted.
    expect(plan.courses.find((course) => course.code === "ACC 102")).toMatchObject({ masterCourseId: null, units: 3 });
    expect(plan.notes.map((note) => note.kind)).toEqual(["NOT_IN_REGISTRY"]);
    // Citizenship Orientation appears every semester; titles stay unique.
    const citizenship = plan.courses.filter((course) => course.title.startsWith("Citizenship Orientation"));
    expect(citizenship).toHaveLength(8);
    expect(new Set(citizenship.map((course) => course.title)).size).toBe(8);
    expect(citizenship[1].title).toBe("Citizenship Orientation (BU-GST 012)");
  });

  it("uses the standard block for General Education rows, and leaves swap-ins for DAP", () => {
    const plan = planCourseStructure({
      levels: [100, 200, 300, 400],
      rows: [
        row({ rowNumber: 2, code: "BU-GST 400", title: "Religion and Social Ethics", level: 400, semester: 1, units: 2 }),
        row({ rowNumber: 3, code: "ENT 322", title: "Venture Creation", level: 300, semester: 2, units: 2 }),
      ],
      registry: new Map(),
      existing: [],
    });
    expect(plan.counts).toMatchObject({ coveredByBlock: 1, skipped: 1, fromFile: 0 });
    expect(plan.courses.find((course) => course.code === "BU-GST 400")).toMatchObject({ level: 400, semester: 2, units: 3 });
    expect(plan.courses.some((course) => course.code === "ENT 322")).toBe(false);
    expect(plan.notes[0]).toMatchObject({ kind: "NEEDS_EXEMPTION", code: "ENT 322", rowNumber: 3 });
  });

  it("reports missing units, repeated codes and unusable rows instead of guessing", () => {
    const plan = planCourseStructure({
      levels: [100, 200, 300, 400],
      rows: [
        row({ rowNumber: 2, code: "SURG 401", units: null, level: 400, semester: null }),
        row({ rowNumber: 3, code: "PIO 212", units: null, level: 200 }),
        row({ rowNumber: 4, code: "AGX 503", level: 300 }),
        row({ rowNumber: 5, code: "AGX 503", level: 300, semester: 2 }),
        row({ rowNumber: 6, code: "not a code" }),
        row({ rowNumber: 7, code: "MBS 401", level: 400, semester: null, units: 12, status: "E" }),
      ],
      registry: new Map([["PIO 212", master({ id: "m-pio", code: "PIO 212", title: "Physiology II", units: 2 })]]),
      existing: [],
    });
    expect(plan.notes.filter((note) => note.kind !== "NOT_IN_REGISTRY").map((note) => [note.kind, note.rowNumber])).toEqual([
      ["NO_UNITS", 2],
      ["LISTED_TWICE", 5],
      ["BAD_ROW", 6],
    ]);
    // Units from the Registry when file 02 has none.
    expect(plan.courses.find((course) => course.code === "PIO 212")).toMatchObject({ units: 2, title: "Physiology II" });
    // A sessional elective of up to 12 units (B13).
    expect(plan.courses.find((course) => course.code === "MBS 401")).toMatchObject({ semester: null, units: 12, status: "ELECTIVE" });
  });

  it("never changes or repeats what the draft already holds", () => {
    const plan = planCourseStructure({
      levels: [100],
      rows: [row({ rowNumber: 2 })],
      registry: new Map(),
      existing: [
        { code: "ACC 101", title: "Introduction to Financial Accounting I" },
        { code: "GST 111", title: "Communication in English" },
      ],
    });
    expect(plan.counts).toMatchObject({ alreadyInDraft: 1, fromFile: 0, block: 7 });
    expect(plan.courses.map((course) => course.code)).not.toContain("GST 111");
  });
});

describe("progress (W1)", () => {
  it("never counts the General Education block as the Head of Department's work", () => {
    const blockOnly = calculateSubmissionProgress({
      content: null,
      activeStaffCount: 0,
      courses: [
        { isGeneralEducation: true, description: { courseContent: "Shared", learningOutcomes: ["Explain"] } },
      ],
    });
    expect(blockOnly.sections.find((item) => item.key === "courses")).toMatchObject({ complete: false });
    expect(blockOnly.sections.find((item) => item.key === "descriptions")).toMatchObject({ percentage: 0 });

    const withOwn = calculateSubmissionProgress({
      content: null,
      activeStaffCount: 0,
      courses: [
        { isGeneralEducation: true, description: null },
        { description: { courseContent: "Own", learningOutcomes: ["Apply"] } },
      ],
    });
    expect(withOwn.sections.find((item) => item.key === "descriptions")).toMatchObject({ percentage: 100 });
  });
});
