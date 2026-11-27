/**
 * Tasks W4, W5 and W15: how the bulletin lays out a programme's credit
 * summary, its graduation numbers and each course description. Shared by the
 * preview and the Word and PDF exports, so all three print the same thing.
 */
import { type CreditSummary, creditSummary, graduationNumbersText } from "@/lib/courses/credit-summary";
import type { BulletinCourse, BulletinProgramme } from "@/lib/bulletin/generation";

/** W15: the line that opens the learning outcomes. */
export const OUTCOMES_LEAD = "At the end of this course, students should be able to:";

const STATUS_WORD: Record<string, string> = { CORE: "Core", ELECTIVE: "Elective", REQUIRED: "Required", MANDATORY: "Core" };

/** W15: "CODE: Title (N units, Core or Elective; lecture hours, practical hours)". */
export function courseHeading(course: Pick<BulletinCourse, "code" | "title" | "units" | "status" | "lectureHours" | "practicalHours">): string {
  const parts = [`${course.units} unit${course.units === 1 ? "" : "s"}, ${STATUS_WORD[course.status] ?? "Core"}`];
  if (course.lectureHours != null || course.practicalHours != null) {
    parts.push(`${course.lectureHours ?? 0} lecture hours, ${course.practicalHours ?? 0} practical hours`);
  }
  return `${course.code}: ${course.title} (${parts.join("; ")})`;
}

/** W4: the programme's credit summary, counting elective groups' minimums (W3). */
export function programmeCreditSummary(programme: Pick<BulletinProgramme, "courses" | "electiveGroups">): CreditSummary {
  return creditSummary(
    programme.courses.map((course) => ({
      code: course.code,
      level: course.level,
      units: course.units,
      status: course.status,
      generalEducation: course.generalEducation ?? false,
      owned: course.owned ?? true,
      electiveGroupId: course.electiveGroupId ?? null,
    })),
    programme.electiveGroups ?? [],
  );
}

/** W4 as table rows: Level, General Education, Departmental, Non-departmental, Total. */
export const CREDIT_SUMMARY_HEADERS = ["Level", "General Education", "Departmental", "Non-departmental", "Total"];

export function creditSummaryRows(summary: CreditSummary): string[][] {
  const rows = summary.rows.map((row) => [
    `${row.level} Level`,
    String(row.generalEducation),
    String(row.departmental),
    String(row.outside),
    String(row.total),
  ]);
  rows.push([
    "Total",
    String(summary.totals.generalEducation),
    String(summary.totals.departmental),
    String(summary.totals.outside),
    String(summary.totals.total),
  ]);
  return rows;
}

/** W5: the graduation numbers in words, or nothing for an empty structure. */
export function graduationNumbersLine(summary: CreditSummary): string | null {
  return summary.totals.total > 0 ? graduationNumbersText(summary.totals) : null;
}
