/**
 * Rule W14: every programme page follows the same order. The university's
 * vision and mission come first, inserted automatically and never edited by
 * Heads (DAP supplies the official wording in
 * data/bulletin/university-statements.json); then the department's vision,
 * mission and philosophy; objectives; admission and graduation requirements;
 * the credit summary; the course structure by level; and the course
 * descriptions. The staff directory and the regulations follow.
 */
import statements from "@/data/bulletin/university-statements.json";

export type UniversityStatements = { vision: string | null; mission: string | null };

const clean = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export const UNIVERSITY_STATEMENTS: UniversityStatements = {
  vision: clean((statements as Record<string, unknown>).vision),
  mission: clean((statements as Record<string, unknown>).mission),
};

export const UNIVERSITY_HEADING = "Babcock University: Vision and Mission";

/** The department's statements, in the bulletin's order. */
export const DEPARTMENT_STATEMENTS = [
  ["Vision", "vision"],
  ["Mission", "mission"],
  ["Philosophy", "philosophy"],
] as const;

/** The numbered sections of a programme page, in order. */
export const PROGRAMME_PAGE_SECTIONS = [
  "Programme Vision, Mission, Philosophy and Objectives",
  "Admission and Graduation Requirements",
  "Programme Course Structure",
  "Course Descriptions",
  "Staff Directory",
  "Regulations and Summary of Changes",
] as const;

export type ProgrammePageSection = (typeof PROGRAMME_PAGE_SECTIONS)[number];

/** "3. Programme Course Structure". */
export function sectionTitle(section: ProgrammePageSection): string {
  return `${PROGRAMME_PAGE_SECTIONS.indexOf(section) + 1}. ${section}`;
}

/** The statements to print, or null when DAP hasn't supplied any. */
export function universityStatementsFor(override?: UniversityStatements | null): UniversityStatements | null {
  const value = override ?? UNIVERSITY_STATEMENTS;
  return value.vision || value.mission ? value : null;
}
