/**
 * Units and semester rules for every course, in the registry and in a
 * programme's Course Structure (task B13, rule W17).
 *
 * - Units run from 0 (Citizenship Orientation, BU-GST 011 to BU-GST 052) to
 *   12 (BU-PHS 416 Internship).
 * - A course has semester 1 or 2, or no semester at all: a sessional course
 *   that runs the whole year (all MBBS courses and some practicums). No
 *   semester is stored as null.
 *
 * The database holds the same rules (migration
 * 20261123150000_sessional_courses_and_unit_range).
 */

export const MIN_COURSE_UNITS = 0;
export const MAX_COURSE_UNITS = 12;
export const COURSE_SEMESTERS = [1, 2] as const;

export type CourseSemester = (typeof COURSE_SEMESTERS)[number] | null;

export const UNITS_RULE_MESSAGE = `Units must be a whole number from ${MIN_COURSE_UNITS} to ${MAX_COURSE_UNITS}.`;
export const SEMESTER_RULE_MESSAGE =
  "Semester must be 1, 2, or left empty for a sessional course with no semester.";

export function isValidCourseUnits(units: unknown): units is number {
  return (
    typeof units === "number" &&
    Number.isInteger(units) &&
    units >= MIN_COURSE_UNITS &&
    units <= MAX_COURSE_UNITS
  );
}

/** Words that mean "no semester" in an upload or a form. */
const NO_SEMESTER_WORDS = new Set(["", "0", "-", "none", "nil", "n/a", "na", "s", "sessional", "session", "year", "whole year", "full year"]);

/**
 * Reads a semester from a form, an API body or a spreadsheet cell.
 * Returns 1, 2 or null (no semester), or `undefined` when the value is not
 * a semester at all.
 */
export function parseCourseSemester(value: unknown): CourseSemester | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (value === 1 || value === 2) return value;
    if (value === 0) return null;
    return undefined;
  }
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  if (NO_SEMESTER_WORDS.has(text)) return null;
  if (["1", "first", "first semester", "1st", "harmattan"].includes(text)) return 1;
  if (["2", "second", "second semester", "2nd", "rain"].includes(text)) return 2;
  return undefined;
}

/** "First Semester", "Second Semester" or "Sessional (no semester)". */
export function courseSemesterLabel(semester: number | null | undefined): string {
  if (semester === 1) return "First Semester";
  if (semester === 2) return "Second Semester";
  return "Sessional (no semester)";
}

/** Short label for tables: "1", "2" or "Sessional". */
export function courseSemesterShortLabel(semester: number | null | undefined): string {
  return semester === 1 || semester === 2 ? String(semester) : "Sessional";
}

/**
 * Sort key so a level reads First Semester, Second Semester, then the
 * sessional courses.
 */
export function courseSemesterOrder(semester: number | null | undefined): number {
  return semester === 1 || semester === 2 ? semester : 3;
}
