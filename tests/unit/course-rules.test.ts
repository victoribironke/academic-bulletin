import { describe, expect, it } from "vitest";
import {
  courseSemesterLabel,
  courseSemesterOrder,
  isValidCourseUnits,
  parseCourseSemester,
} from "@/lib/courses/course-rules";
import {
  validateCourseImportRows,
  validateMasterCourseImportRows,
} from "@/lib/imports/courses";

// Task B13: 0-unit, up-to-12-unit and no-semester (sessional) courses.

describe("course units (B13)", () => {
  it("accepts 0 to 12 units and nothing else", () => {
    expect(isValidCourseUnits(0)).toBe(true); // Citizenship Orientation
    expect(isValidCourseUnits(12)).toBe(true); // BU-PHS 416 Internship
    expect(isValidCourseUnits(3)).toBe(true);
    expect(isValidCourseUnits(13)).toBe(false);
    expect(isValidCourseUnits(-1)).toBe(false);
    expect(isValidCourseUnits(2.5)).toBe(false);
    expect(isValidCourseUnits(Number.NaN)).toBe(false);
    expect(isValidCourseUnits("3")).toBe(false);
  });
});

describe("course semester (B13, rule W17)", () => {
  it("reads 1, 2 and the ways of writing no semester", () => {
    expect(parseCourseSemester(1)).toBe(1);
    expect(parseCourseSemester("2")).toBe(2);
    expect(parseCourseSemester("First")).toBe(1);
    expect(parseCourseSemester("Second Semester")).toBe(2);
    for (const none of [null, undefined, "", " ", "Sessional", "S", "0", 0, "-", "None"]) {
      expect(parseCourseSemester(none)).toBeNull();
    }
  });

  it("refuses anything that is not a semester", () => {
    for (const bad of [3, "3", "third", 1.5, true, {}]) {
      expect(parseCourseSemester(bad)).toBeUndefined();
    }
  });

  it("labels and orders sessional courses after the two semesters", () => {
    expect(courseSemesterLabel(1)).toBe("First Semester");
    expect(courseSemesterLabel(2)).toBe("Second Semester");
    expect(courseSemesterLabel(null)).toBe("Sessional (no semester)");
    expect([null, 2, 1].sort((a, b) => courseSemesterOrder(a) - courseSemesterOrder(b))).toEqual([1, 2, null]);
  });
});

describe("course uploads with held-back rows from package file 03 (B13)", () => {
  const courseRow = (overrides: Record<string, unknown>) => ({
    "Course Code": "ANAT 223",
    "Course Title": "Gross Anatomy I",
    Units: 3,
    Status: "CORE",
    Semester: "",
    Level: 200,
    ...overrides,
  });

  it("loads an MBBS course with no semester as a sessional course, with a warning", () => {
    const [row] = validateCourseImportRows([courseRow({})]);
    expect(row.errors).toEqual([]);
    expect(row.data!.semester).toBeNull();
    expect((row.warnings ?? []).join(" ")).toMatch(/sessional/i);
  });

  it("loads 0-unit and 12-unit courses", () => {
    const rows = validateCourseImportRows([
      courseRow({ "Course Code": "BU-GST 011", "Course Title": "Citizenship Orientation", Units: 0, Semester: 1, Level: 100 }),
      courseRow({ "Course Code": "BU-PHS 416", "Course Title": "Internship", Units: 12, Semester: 2, Level: 400 }),
    ]);
    expect(rows.map((row) => row.errors)).toEqual([[], []]);
    expect(rows.map((row) => row.data!.units)).toEqual([0, 12]);
  });

  it("refuses an empty Units cell instead of reading it as 0", () => {
    const [row] = validateCourseImportRows([courseRow({ Units: "" })]);
    expect(row.errors.join(" ")).toMatch(/Units must be a whole number from 0 to 12/);
  });

  it("refuses 13 units and semester 3", () => {
    const [row] = validateCourseImportRows([courseRow({ Units: 13, Semester: 3 })]);
    expect(row.errors.join(" ")).toMatch(/0 to 12/);
    expect(row.errors.join(" ")).toMatch(/Semester must be 1, 2, or left empty/);
  });

  it("applies the same rules to registry uploads", () => {
    const [sessional, zero, bad] = validateMasterCourseImportRows([
      { "Course Code": "SURG 401", "Course Title": "Introduction to Clinical Surgery", Units: 4, "Course Type": "CORE", Ownership: "SCHOOL", "Owner School Code": "BUSM", Level: 400, Semester: "Sessional" },
      { "Course Code": "BU-GST 012", "Course Title": "Citizenship Orientation", Units: 0, "Course Type": "GST_BU", Ownership: "INSTITUTIONAL", Level: 100, Semester: 2 },
      { "Course Code": "BU-PHS 417", "Course Title": "Long Internship", Units: 13, "Course Type": "CORE", Ownership: "SCHOOL", "Owner School Code": "SPH", Level: 400, Semester: 2 },
    ]);
    expect(sessional.errors).toEqual([]);
    expect(sessional.data!.semester).toBeNull();
    expect(zero.errors).toEqual([]);
    expect(zero.data!.units).toBe(0);
    expect(bad.errors.join(" ")).toMatch(/0 to 12/);
  });
});
