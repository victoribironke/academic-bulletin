/**
 * Task F1 on the server: loads one draft, runs the Appendix A checks and the
 * required-content checks the export already had, and marks the "Please
 * check" findings the Head has accepted with a reason. The Submit and approve
 * gates (F3), the readiness panel (F2) and the section marks (G4) all read
 * this one list.
 */
import prisma from "@/lib/prisma";
import { courseCodeKey } from "@/lib/courses/code-key";
import { confirmedCourseLists } from "@/lib/courses/course-list";
import { getCourseGraceBlockers } from "@/lib/courses/grace-compliance";
import { generalEducationBlockFor, isGeneralEducationCourse, programmeLevels } from "@/lib/courses/general-education";
import { legacyReadinessIssues } from "@/lib/submissions/submit-readiness";
import { type DraftData, type Finding, type SectionKey, runRules } from "@/lib/checks/rules";

export type CheckResult = Finding & {
  accepted: { reason: string; by: string | null; at: string } | null;
};

/** Required content the bulletin export already refused to print without. */
const LEGACY: Record<string, { section: SectionKey; field?: string } | null> = {
  NO_STAFF: null, // V19
  STAFF_RANK_MISSING: null, // V19
  NO_COURSES: null, // V2
  UNIT_TOTAL_MISMATCH: null, // V1
  MISSING_MINIMUM_CGPA: null, // V26
  CGPA_OUT_OF_RANGE: null, // V26
  INCOMPLETE_COURSE_DETAILS: { section: "descriptions" },
  MISSING_PHILOSOPHY: { section: "overview", field: "philosophy" },
  MISSING_MISSION: { section: "overview", field: "mission" },
  MISSING_VISION: { section: "overview", field: "vision" },
  MISSING_UTMEREQUIREMENTS: { section: "admission", field: "utmeRequirements" },
  MISSING_GRADUATIONREQUIREMENTS: { section: "graduation", field: "graduationRequirements" },
  PHILOSOPHY_LENGTH: { section: "overview", field: "philosophy" },
  PHILOSOPHY_OTHER_PROGRAMME: { section: "overview", field: "philosophy" },
  PHILOSOPHY_GRACE_REQUIRED: { section: "overview", field: "philosophy" },
  MISSING_MINIMUM_DURATION: { section: "admission", field: "minimumDuration" },
  MISSING_TOTAL_UNITS: { section: "graduation", field: "totalUnits" },
};

export async function loadDraftData(submissionId: string): Promise<DraftData> {
  const draft = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: {
      id: true,
      currentPhase: true,
      programme: { select: { code: true, name: true, duration: true, isNew: true, departmentId: true } },
      content: true,
      courses: {
        select: {
          code: true,
          title: true,
          units: true,
          level: true,
          semester: true,
          status: true,
          masterCourseId: true,
          masterCourse: { select: { type: true, ownership: true, ownerDeptId: true } },
          description: { select: { learningOutcomes: true, courseContent: true } },
        },
      },
      comments: { where: { status: "OPEN" }, select: { section: true } },
    },
  });
  const departmentId = draft.programme.departmentId;
  const unlinked = draft.courses.filter((course) => !course.masterCourseId).map((course) => course.code);
  const [staff, confirmed, blockers, registryMatches] = await Promise.all([
    prisma.staff.findMany({
      where: { departmentId, isActive: true },
      select: { type: true, academicRank: true, highestQualification: true, customJobTitle: true, firstName: true, surname: true },
    }),
    confirmedCourseLists([{ id: draft.id, courses: draft.courses }]),
    getCourseGraceBlockers(submissionId),
    unlinked.length
      ? prisma.masterCourse.findMany({ where: { code: { in: unlinked } }, select: { code: true } })
      : Promise.resolve([]),
  ]);
  const known = new Set(registryMatches.map((row) => courseCodeKey(row.code)));
  // The General Education block is set by the app itself (section 6.1), so its codes are always known.
  for (const item of generalEducationBlockFor(programmeLevels(draft.programme.duration, draft.courses.map((course) => course.level)))) {
    known.add(courseCodeKey(item.code));
  }
  const blocked = [...new Set(Object.values(blockers).flat())];
  return {
    submissionId,
    phase: draft.currentPhase,
    programme: { code: draft.programme.code, name: draft.programme.name, duration: draft.programme.duration, isNew: draft.programme.isNew },
    content: draft.content as Record<string, unknown> | null,
    courses: draft.courses.map((course) => {
      const outcomes = Array.isArray(course.description?.learningOutcomes)
        ? (course.description!.learningOutcomes as unknown[]).map(String).filter((item) => item.trim())
        : [];
      return {
        code: course.code,
        title: course.title,
        units: course.units,
        level: course.level,
        semester: course.semester,
        status: course.status,
        inRegistry: Boolean(course.masterCourseId) || known.has(courseCodeKey(course.code)),
        generalEducation: isGeneralEducationCourse(course),
        owned: !course.masterCourse || course.masterCourse.ownerDeptId === departmentId,
        description: course.description ? { learningOutcomes: outcomes, courseContent: course.description.courseContent ?? "" } : null,
      };
    }),
    staff: staff.map(({ firstName, surname, ...member }) => ({
      ...member,
      highestQualification: member.highestQualification ?? null,
      name: `${firstName ?? ""} ${surname ?? ""}`.trim() || undefined,
    })),
    openComments: draft.comments,
    courseListConfirmed: confirmed.has(draft.id),
    graceBlocked: blocked,
  };
}

/** Every check for one draft, with the accepted "Please check" findings marked. */
export async function runChecks(submissionId: string): Promise<CheckResult[]> {
  const [data, legacy, acceptances] = await Promise.all([
    loadDraftData(submissionId),
    legacyReadinessIssues(submissionId),
    prisma.checkAcceptance.findMany({
      where: { submissionId },
      select: { checkKey: true, reason: true, acceptedAt: true, acceptedBy: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const findings: Finding[] = runRules(data);
  for (const issue of legacy) {
    const place = LEGACY[issue.code];
    if (place === null) continue;
    findings.push({
      rule: "Required",
      level: "MUST",
      section: place?.section ?? "overview",
      field: place?.field,
      key: issue.code,
      message: issue.message,
    });
  }
  const accepted = new Map(acceptances.map((item) => [item.checkKey, item]));
  return findings.map((finding) => {
    const acceptance = finding.level === "CHECK" ? accepted.get(finding.key) : undefined;
    return {
      ...finding,
      accepted: acceptance
        ? {
            reason: acceptance.reason,
            by: acceptance.acceptedBy ? `${acceptance.acceptedBy.firstName} ${acceptance.acceptedBy.lastName}`.trim() : null,
            at: acceptance.acceptedAt.toISOString(),
          }
        : null,
    };
  });
}

/** What still blocks Submit or Approve (F3): every Must fix. */
export function blocking(results: CheckResult[]): CheckResult[] {
  return results.filter((result) => result.level === "MUST");
}

/** What is still open for the readiness panel: Must fix, and Please check not yet accepted. */
export function open(results: CheckResult[]): CheckResult[] {
  return results.filter((result) => result.level === "MUST" || (result.level === "CHECK" && !result.accepted));
}
