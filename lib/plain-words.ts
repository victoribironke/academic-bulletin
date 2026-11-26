/**
 * Task U1 (plain words on every screen, R1): the words people see, in one
 * place. The database keeps its codes (GST_NUC, INSTITUTIONAL, ...); every
 * screen, template and message shows the words on the right of the work
 * order's table instead. tests/unit/plain-words.test.ts searches the screens
 * for the old words.
 */
import type { CommentType, CourseOwnership, CourseStatus, CourseType } from "@prisma/client";

/** What the course registry is called on screen (was "Master Courses"). */
export const REGISTRY_NAME = "Course Registry";

export const COURSE_TYPE_LABELS: Record<CourseType, string> = {
  CORE: "Core",
  GENERAL: "General",
  ELECTIVE: "Elective",
  REQUIRED: "Required",
  GST_NUC: "National General Studies",
  GST_BU: "Babcock General Education",
};

export const OWNERSHIP_LABELS: Record<CourseOwnership, string> = {
  DEPARTMENT: "Department",
  SCHOOL: "School",
  INSTITUTIONAL: "University-wide",
};

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  CORE: "Core",
  ELECTIVE: "Elective",
};

export const COMMENT_TYPE_LABELS: Record<CommentType, string> = {
  SUGGESTION: "Suggestion",
  ISSUE: "Issue",
  QUESTION: "Question",
  APPROVAL: "Approval",
};

/** A registry upload row that breaks the General Education ownership rule. */
export const GENERAL_STUDIES_OWNERSHIP_RULE =
  "National General Studies and Babcock General Education courses must be University-wide.";

/** The registry switch that was called "Discoverable". */
export const SHOW_IN_SEARCH = "Show in course search";

export function courseTypeLabel(type: string): string {
  return COURSE_TYPE_LABELS[type as CourseType] ?? type;
}

export function ownershipLabel(ownership: string): string {
  return OWNERSHIP_LABELS[ownership as CourseOwnership] ?? ownership;
}

function reverse<T extends string>(labels: Record<T, string>): Record<string, T> {
  const key = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return Object.fromEntries(Object.entries(labels).map(([code, label]) => [key(label as string), code as T]));
}

const TYPE_FROM_WORDS = reverse(COURSE_TYPE_LABELS);
const OWNERSHIP_FROM_WORDS = reverse(OWNERSHIP_LABELS);

/**
 * A course type typed in a spreadsheet, in plain words or as the old code.
 * `value` is already upper-cased with underscores (normalizedEnum).
 */
export function courseTypeFromSheet(value: string): string {
  if (value === "GST_NUC" || value === "GST_BU") return value;
  return TYPE_FROM_WORDS[value] ?? value;
}

export function ownershipFromSheet(value: string): string {
  return OWNERSHIP_FROM_WORDS[value] ?? value;
}

/**
 * The left column of U1's table: none of these may appear in screen text.
 * Each is matched as written (case matters, so "master courses" in a code
 * comment about the table is not a screen word). The old status name for
 * "Revision requested" is guarded by tests/unit/phase-names.test.ts (Q6).
 */
export const OLD_SCREEN_WORDS = [
  "Master Course",
  "Contributor",
  "Discoverable",
  "GST (NUC)",
  "GST (BU)",
  "GST_NUC",
  "GST_BU",
  "INSTITUTIONAL",
  "Internal Server Error",
  "Error 500",
] as const;
