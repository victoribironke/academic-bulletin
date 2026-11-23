import { describe, expect, it } from "vitest";
import { type ReportLink, buildCompletenessReport } from "@/lib/reports/registry-completeness";

// Task B8: the Registry completeness report.

const programme = { id: "p1", code: "SMSC-ACC-ACC", name: "Accounting", isNew: false };
const link = (code: string, overrides: Partial<ReportLink["course"]> = {}, extra: Partial<ReportLink> = {}): ReportLink => ({
  programme,
  course: {
    code,
    title: `Course ${code}`,
    units: 3,
    level: 100,
    semester: 1,
    ownership: "DEPARTMENT",
    ownerDeptId: "d1",
    ownerSchoolId: null,
    courseContent: "Content.",
    description: null,
    learningOutcomes: ["Explain"],
    ...overrides,
  },
  unitsOverride: null,
  semesterOverride: null,
  ...extra,
});

describe("the Registry completeness report (B8)", () => {
  const report = buildCompletenessReport({
    programmes: [programme],
    links: [
      ...["ACC 101", "ACC 103", "ACC 105", "ACC 107", "ACC 109", "ACC 111"].map((code) => link(code)), // 18 credits
      link("ACC 102", { semester: 2 }), // 3 credits: too few
      link("ACC 104", { semester: 2 }, { unitsOverride: 6 }), // the programme's own units
      link("ACC 199", { semester: null, units: 6 }), // sessional
      link("ACC 113", { courseContent: null, learningOutcomes: [] }),
      link("ACC 115", { ownerDeptId: null }),
      link("ACC 117", { title: "Course ACC 101" }),
      link("SEN401", { semester: 2 }),
    ],
    statedTotals: new Map([["p1", 150]]),
  });

  it("adds up credits per semester and flags those outside 16 to 24", () => {
    const rows = report.semesters.map((row) => [row.level, row.semester, row.courses, row.credits, row.withinRange]);
    expect(rows).toEqual([
      [100, "1", 9, 27, false],
      [100, "2", 3, 12, false],
      [100, "Sessional", 1, 6, null],
    ]);
  });

  it("lists courses missing a description, outcomes or an owner, and possible duplicates", () => {
    expect(report.issues.map((item) => `${item.code}: ${item.issue}`)).toEqual([
      "ACC 113: No description",
      "ACC 113: No learning outcomes",
      "ACC 115: No owner department or school",
      "ACC 117: Same title as ACC 101",
      'SEN401: Code not in the standard format ("ABC 123"); may duplicate another code (B3)',
    ]);
    expect(report.programmes[0]).toMatchObject({
      courses: 13,
      totalCredits: 45,
      statedTotal: 150,
      semestersOutOfRange: 2,
      missingDescription: 1,
      missingOutcomes: 1,
      noOwner: 1,
      duplicates: 2,
    });
  });
});
