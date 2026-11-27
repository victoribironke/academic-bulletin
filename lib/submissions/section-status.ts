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
import { isOwnedElsewhere, programmePlace } from "@/lib/courses/shared-courses";
import { confirmedCourseLists } from "@/lib/courses/course-list";
import { calculateSubmissionProgress, type SubmissionProgress } from "@/lib/submissions/progress";

/** One finding of the rules engine, as the marks need it (F1). */
export type MarkFinding = {
  rule: string;
  level: "MUST" | "CHECK" | "FIXED";
  section: string;
  key: string;
  message: string;
  accepted?: unknown;
};

/** Findings that only say something is still empty: not shown on a section nobody has started. */
function onlyEmpty(finding: MarkFinding): boolean {
  return (
    ["V2", "V6", "V14", "V17", "V19"].includes(finding.rule) ||
    finding.key.startsWith("MISSING_") ||
    finding.key === "INCOMPLETE_COURSE_DETAILS" ||
    (finding.rule === "V26" && finding.message.startsWith("Enter"))
  );
}

export type SectionMark = {
  state: "done" | "check" | "fix" | "none";
  /** Things to fix plus open comments (the red number). */
  count: number;
  /** In words, for the tooltip and screen readers. */
  label: string;
};

export function sectionMarks(
  progress: SubmissionProgress,
  findings: MarkFinding[],
  openComments: Record<string, number>,
): Record<string, SectionMark> {
  const marks: Record<string, SectionMark> = {};
  for (const section of progress.sections) {
    const started = section.percentage > 0;
    // Open comments are counted below, once (V13 is the same thing).
    const relevant = findings.filter((finding) => finding.section === section.key && finding.rule !== "V13");
    const problems = relevant.filter((finding) => finding.level === "MUST" && (started || !onlyEmpty(finding)));
    const toCheck = relevant.filter((finding) => finding.level === "CHECK" && !finding.accepted && started);
    const comments = openComments[section.key] ?? 0;
    const count = problems.length + comments;
    if (count > 0) {
      const parts = [
        ...problems.map((problem) => problem.message),
        ...(comments > 0 ? [`${comments} open comment${comments === 1 ? "" : "s"}`] : []),
      ];
      marks[section.key] = { state: "fix", count, label: `${count} to fix: ${parts.join(" ")}` };
    } else if (section.complete && toCheck.length === 0) {
      marks[section.key] = { state: "done", count: 0, label: "Complete" };
    } else if (started || section.hint || toCheck.length) {
      marks[section.key] = {
        state: "check",
        count: 0,
        label: section.hint
          ? `Needs checking: ${section.hint}`
          : toCheck.length
            ? `Please check: ${toCheck[0].message}`
            : `Needs checking: ${section.percentage}% done`,
      };
    } else {
      marks[section.key] = { state: "none", count: 0, label: "Not started" };
    }
  }
  return marks;
}

const progressSelect = {
  id: true,
  programme: {
    select: {
      departmentId: true,
      department: { select: { schoolId: true, _count: { select: { staff: { where: { isActive: true } } } } } },
    },
  },
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
      masterCourse: { select: { type: true, ownership: true, ownerDeptId: true, ownerSchoolId: true } },
      description: { select: { courseContent: true, learningOutcomes: true, graceStatus: true } },
    },
  },
} as const;

/** Progress for several drafts, the same way the dashboard and My desk work it out (G5). */
export async function progressForDrafts(submissionIds: string[]): Promise<Map<string, SubmissionProgress>> {
  if (submissionIds.length === 0) return new Map();
  const drafts = await prisma.submission.findMany({ where: { id: { in: submissionIds } }, select: progressSelect });
  const confirmed = await confirmedCourseLists(drafts);
  return new Map(
    drafts.map((draft) => [
      draft.id,
      calculateSubmissionProgress({
        content: draft.content,
        activeStaffCount: draft.programme.department._count.staff,
        courses: draft.courses.map((course) => ({
          isGeneralEducation: isGeneralEducationCourse(course),
          ownedElsewhere: isOwnedElsewhere(course, programmePlace(draft.programme)),
          description: course.description,
        })),
        courseListConfirmed: confirmed.has(draft.id),
      }),
    ]),
  );
}

/** Progress for one draft (G5). */
export async function draftProgress(submissionId: string): Promise<SubmissionProgress> {
  const progress = (await progressForDrafts([submissionId])).get(submissionId);
  if (!progress) throw new Error("No such draft.");
  return progress;
}

export async function getSectionMarks(submissionId: string) {
  const { runChecks } = await import("@/lib/checks/run");
  const [progress, findings, comments] = await Promise.all([
    draftProgress(submissionId),
    runChecks(submissionId),
    prisma.comment.groupBy({
      by: ["section"],
      where: { submissionId, status: "OPEN" },
      _count: { _all: true },
    }),
  ]);
  const openComments = Object.fromEntries(
    comments.filter((row) => row.section).map((row) => [row.section as string, row._count._all]),
  );
  return { percentage: progress.percentage, marks: sectionMarks(progress, findings, openComments) };
}
