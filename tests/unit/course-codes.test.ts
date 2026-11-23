import { describe, expect, it } from "vitest";
import {
  COURSE_CODE_PATTERN,
  formatCourseCode,
  isValidCourseCode,
} from "@/lib/validation/name-format";
import {
  validateCourseImportRows,
  validateMasterCourseImportRows,
} from "@/lib/imports/courses";
import { importableRows } from "@/lib/imports/spreadsheet";

describe("course codes (B3, B16)", () => {
  it("keeps national codes in one format", () => {
    for (const [typed, tidy] of [
      ["ECO 101", "ECO 101"],
      ["eco101", "ECO 101"],
      ["ECO-101", "ECO 101"],
      ["  gst   112 ", "GST 112"],
      ["ANAT 223", "ANAT 223"],
    ]) {
      expect(formatCourseCode(typed), typed).toBe(tidy);
      expect(isValidCourseCode(typed), typed).toBe(true);
    }
  });

  it("accepts Babcock-specific codes and tidies their variants", () => {
    for (const [typed, tidy] of [
      ["BU-GST 112", "BU-GST 112"],
      ["BU- NSC 401", "BU-NSC 401"],
      ["BU-SEN-417", "BU-SEN 417"],
      ["BU-FRE310", "BU-FRE 310"],
      ["bu-eco 125", "BU-ECO 125"],
      ["BU ECO 125", "BU-ECO 125"],
      ["BU-ANAT 201", "BU-ANAT 201"],
      ["BU-GST 011", "BU-GST 011"],
    ]) {
      expect(formatCourseCode(typed), typed).toBe(tidy);
      expect(isValidCourseCode(typed), typed).toBe(true);
      expect(COURSE_CODE_PATTERN.test(tidy)).toBe(true);
    }
  });

  it("never strips the prefix: GST 112 and BU-GST 112 are different courses", () => {
    expect(formatCourseCode("BU-GST 112")).not.toBe(formatCourseCode("GST 112"));
  });

  it("treats BU as the Babcock prefix only when a hyphen or space follows", () => {
    // A national prefix that starts with BU keeps its own code.
    expect(formatCourseCode("BUS 101")).toBe("BUS 101");
    expect(formatCourseCode("BUAD101")).toBe("BUAD 101");
  });

  it("rejects what can't be tidied", () => {
    for (const typed of ["", "ECO", "101", "E 101", "ECO 10", "ECO 1011", "BU-", "BU-ECO", "BU--ECO 101x", "ECONOMICS 101"]) {
      expect(isValidCourseCode(typed), typed).toBe(false);
    }
  });
});

const registryRow = (code: string, title: string, extra: Record<string, unknown> = {}) => ({
  "Course Code": code,
  "Course Title": title,
  Units: 6,
  "Course Type": "CORE",
  Ownership: "DEPARTMENT",
  Level: 400,
  Semester: 2,
  "Owner Department Code": "VSSS-ECO",
  ...extra,
});

describe("the same title under different codes (B17)", () => {
  it("lets departments share titles such as Research Project", () => {
    const rows = validateMasterCourseImportRows(
      [
        registryRow("ECO 490", "Research Project"),
        registryRow("ACC 490", "Research Project"),
        registryRow("BU-ECO 490", "Research Project"),
      ],
      { existingTitles: ["research project"] },
    );
    expect(rows.map((row) => row.errors)).toEqual([[], [], []]);
    expect(importableRows(rows)).toHaveLength(3);
  });

  it("skips an exact repeat with a warning, and refuses one code with two titles", () => {
    const rows = validateMasterCourseImportRows([
      registryRow("ECO 490", "Research Project"),
      registryRow("ECO 490", "Research Project"),
      registryRow("ECO 490", "Long Essay"),
    ]);
    expect(rows[0]).toMatchObject({ errors: [], skipped: false });
    expect(rows[1]).toMatchObject({ errors: [], skipped: true });
    expect(rows[1].warnings?.[0]).toMatch(/repeat is skipped/);
    expect(rows[2].errors).toContain("Course Code is listed twice in this file with different titles.");
    expect(importableRows(rows).map((row) => row.rowNumber)).toEqual([2]);
  });

  it("still refuses a code already in the course structure", () => {
    const [row] = validateCourseImportRows(
      [{ "Course Code": "ECO 490", "Course Title": "Research Project", Units: 6, Semester: 2, Level: 400 }],
      { existingCodes: ["ECO 490"], existingTitles: ["research project"] },
    );
    expect(row.errors).toEqual(["Course Code is duplicated or already exists."]);
  });

  it("accepts a Babcock-specific course in a course structure", () => {
    const [row] = validateCourseImportRows([
      { "Course Code": "BU-GST 126", "Course Title": "Life and Teachings of Christ the Messiah", Units: 3, Semester: 2, Level: 100 },
    ]);
    expect(row.errors).toEqual([]);
    expect(row.data?.code).toBe("BU-GST 126");
  });
});
