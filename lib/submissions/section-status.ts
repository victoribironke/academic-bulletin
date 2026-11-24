/**
 * Task G4: what each section of a draft shows in the left-hand list.
 *
 * - a tick: complete and correct, with no open comments;
 * - an amber dot: started but something needs checking (not finished, the
 *   course list not confirmed, a description GRACE sent back);
 * - a red number: things that must be fixed before Submit, plus open
 *   comments on the section.
 *
 * A section nobody has started shows nothing, so a fresh draft isn't a wall
 * of red: "missing" problems count once the section has been started.
 */
import prisma from "@/lib/prisma";
import { isGeneralEducationCourse } from "@/lib/courses/general-education";
import { confirmedCourseLists } from "@/lib/courses/course-list";
import { calculateSubmissionProgress, type SubmissionProgress } from "@/lib/submissions/progress";
import { getSubmitReadinessIssues, type SubmitReadinessIssue } from "@/lib/submissions/submit-readiness";

/** Which section each Submit check belongs to. */
export const SECTION_OF_ISSUE: Record<string, string> = {
  NO_STAFF: "staff",
  STAFF_RANK_MISSING: "staff",
  NO_COURSES: "courses",
  UNIT_TOTAL_MISMATCH: "graduation",
  INCOMPLETE_COURSE_DETAILS: "descriptions",
  PHILOSOPHY_LENGTH: "overview",
  PHILOSOPHY_OTHER_PROGRAMME: "overview",
  PHILOSOPHY_GRACE_REQUIRED: "overview",
  MISSING_MINIMUM_DURATION: "admission",
  MISSING_MINIMUM_CGPA: "graduation",
  CGPA_OUT_OF_RANGE: "graduation",
  MISSING_TOTAL_UNITS: "graduation",
};

/** Checks that only say something is empty: not shown on a section nobody has started. */
const ONLY_EMPTY = new Set(["NO_STAFF", "NO_COURSES", "MISSING_MINIMUM_DURATION", "MISSING_MINIMUM_CGPA", "MISSING_TOTAL_UNITS"]);

export type SectionMark = {
  state: "done" | "check" | "fix" | "none";
  /** Things to fix plus open comments (the red number). */
  count: number;
  /** In words, for the tooltip and screen readers. */
  label: string;
};

export function sectionMarks(
  progress: SubmissionProgress,
  issues: SubmitReadinessIssue[],
  openComments: Record<string, number>,
): Record<string, SectionMark> {
  const marks: Record<string, SectionMark> = {};
  for (const section of progress.sections) {
    const started = section.percentage > 0;
    const problems = issues.filter(
      (issue) => SECTION_OF_ISSUE[issue.code] === section.key && (started || !ONLY_EMPTY.has(issue.code)),
    );
    const comments = openComments[section.key] ?? 0;
    const count = problems.length + comments;
    if (count > 0) {
      const parts = [
        ...problems.map((problem) => problem.message),
        ...(comments > 0 ? [`${comments} open comment${comments === 1 ? "" : "s"}`] : []),
      ];
      marks[section.key] = { state: "fix", count, label: `${count} to fix: ${parts.join(" ")}` };
    } else if (section.complete) {
      marks[section.key] = { state: "done", count: 0, label: "Complete" };
    } else if (started || section.hint) {
      marks[section.key] = {
        state: "check",
        count: 0,
        label: section.hint ? `Needs checking: ${section.hint}` : `Needs checking: ${section.percentage}% done`,
      };
    } else {
      marks[section.key] = { state: "none", count: 0, label: "Not started" };
    }
  }
  return marks;
}

/** Progress for one draft, the same way the dashboard and My desk work it out (G5). */
export async function draftProgress(submissionId: string): Promise<SubmissionProgress> {
  const draft = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: {
      id: true,
      programme: { select: { department: { select: { _count: { select: { staff: { where: { isActive: true } } } } } } } },
      content: {
        select: {
          programmeInfo: true,
          philosophy: true,
          mission: true,
          vision: true,
          objectives: true,
          uniqueFeatures: true,
          employability: true,
          utmeRequirements: true,
          directEntryRequirements: true,
          transferRequirements: true,
          minimumDuration: true,
          graduationRequirements: true,
          minimumCGPA: true,
          totalUnits: true,
          sectionF: true,
          sectionG: true,
        },
      },
      courses: {
        select: {
          code: true,
          units: true,
          semester: true,
          level: true,
          status: true,
          masterCourse: { select: { type: true, ownership: true } },
          description: { select: { courseContent: true, learningOutcomes: true, graceStatus: true } },
        },
      },
    },
  });
  const confirmed = await confirmedCourseLists([draft]);
  return calculateSubmissionProgress({
    content: draft.content,
    activeStaffCount: draft.programme.department._count.staff,
    courses: draft.courses.map((course) => ({
      isGeneralEducation: isGeneralEducationCourse(course),
      description: course.description,
    })),
    courseListConfirmed: confirmed.has(draft.id),
  });
}

export async function getSectionMarks(submissionId: string) {
  const [progress, issues, comments] = await Promise.all([
    draftProgress(submissionId),
    getSubmitReadinessIssues(submissionId),
    prisma.comment.groupBy({
      by: ["section"],
      where: { submissionId, status: "OPEN" },
      _count: { _all: true },
    }),
  ]);
  const openComments = Object.fromEntries(
    comments.filter((row) => row.section).map((row) => [row.section as string, row._count._all]),
  );
  return { percentage: progress.percentage, marks: sectionMarks(progress, issues, openComments) };
}
