/**
 * "What is waiting on you" for the My desk panel (work order task T1,
 * section 7.1), for Heads of Department and programme coordinators, Deans
 * and Academic Planning. Each item says how long it has waited and opens the
 * right screen; the first is "Do this next". Scoped like the dashboard, so
 * nobody sees another desk's work.
 */
import { calendarNow } from "@/lib/clock";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { ApiUser } from "@/lib/api-auth";
import { isGeneralEducationCourse } from "@/lib/courses/general-education";
import { isOwnedElsewhere, programmePlace } from "@/lib/courses/shared-courses";
import { calculateSubmissionProgress } from "@/lib/submissions/progress";
import { confirmedCourseLists } from "@/lib/courses/course-list";
import { PHASE_NAMES } from "@/lib/submissions/phases";
import { GENERAL_EDUCATION_WHERE, MINIMUM_OUTCOMES } from "@/lib/courses/courses-we-own";
import { OFFERED_COURSE } from "@/lib/courses/course-owners";
import { isGeneralEducationFamily } from "@/lib/courses/general-education";
import { normalizeLearningOutcomes } from "@/lib/courses/grace-compliance";

export type WaitingKind =
  | "REVISION_REQUESTED"
  | "WAITING_FOR_REVIEW"
  | "VETTING"
  | "OPEN_COMMENTS"
  | "SECTIONS_TO_FINISH"
  | "QUESTIONS"
  | "COURSE_REQUESTS"
  | "GENERAL_EDUCATION"
  | "NO_OWNER";

export type WaitingItem = {
  key: string;
  kind: WaitingKind;
  programme: string;
  text: string;
  href: string;
  since: string | null;
  waited: string | null;
};

const RANK: Record<WaitingKind, number> = {
  REVISION_REQUESTED: 0,
  WAITING_FOR_REVIEW: 1,
  VETTING: 1,
  OPEN_COMMENTS: 2,
  SECTIONS_TO_FINISH: 3,
  QUESTIONS: 1,
  COURSE_REQUESTS: 1,
  GENERAL_EDUCATION: 3,
  NO_OWNER: 3,
};
const DAY_MS = 24 * 60 * 60 * 1000;

/** "waiting since today", "waiting 1 day", "waiting 12 days". */
export function waitedFor(since: Date | null, now: Date): string | null {
  if (!since) return null;
  const days = Math.floor((now.getTime() - since.getTime()) / DAY_MS);
  return days <= 0 ? "waiting since today" : `waiting ${days} ${days === 1 ? "day" : "days"}`;
}

/** Most urgent first: revisions, then reviews, comments and unfinished sections; oldest first within each. */
export function orderWaiting(items: WaitingItem[]): WaitingItem[] {
  return [...items].sort(
    (a, b) =>
      RANK[a.kind] - RANK[b.kind] ||
      (a.since ?? "9999").localeCompare(b.since ?? "9999") ||
      a.programme.localeCompare(b.programme),
  );
}

const lastTransition = { orderBy: { transitionedAt: "desc" as const }, take: 1, select: { action: true, remarks: true, transitionedAt: true } };

export async function waitingWorkFor(user: ApiUser, nowArg?: Date): Promise<WaitingItem[]> {
  // By default as of the test site's pretend clock, if a tester set one.
  const now = nowArg ?? (await calendarNow());
  const cycle = await prisma.reviewCycle.findFirst({
    where: { isActive: true, archivedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!cycle) return [];
  const item = (base: Omit<WaitingItem, "waited" | "since"> & { since: Date | null }): WaitingItem => ({
    ...base,
    since: base.since?.toISOString() ?? null,
    waited: waitedFor(base.since, now),
  });

  // Heads of Department and programme coordinators: their programmes' drafts.
  if (user.role === "HOD" || user.role === "PROGRAMME_COORDINATOR") {
    const scope: Prisma.SubmissionWhereInput =
      user.role === "PROGRAMME_COORDINATOR"
        ? { programmeId: { in: user.programmeIds } }
        : user.departmentId
          ? { programme: { departmentId: user.departmentId } }
          : { id: "none" };
    const drafts = await prisma.submission.findMany({
      where: { cycleId: cycle.id, currentPhase: 1, status: { in: ["DRAFT", "CORRECTIONS_REQUIRED"] }, ...scope },
      select: {
        id: true,
        status: true,
        createdAt: true,
        programme: {
          select: {
            name: true,
            departmentId: true,
            department: { select: { schoolId: true, _count: { select: { staff: { where: { isActive: true } } } } } },
          },
        },
        content: true,
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
        comments: { where: { status: "OPEN" }, select: { createdAt: true }, orderBy: { createdAt: "asc" } },
        phaseTransitions: lastTransition,
      },
    });
    const items: WaitingItem[] = [];
    // G5: a pre-filled course list counts once the Head has confirmed it.
    const confirmedLists = await confirmedCourseLists(drafts);
    for (const draft of drafts) {
      const programme = draft.programme.name;
      const href = `/submissions/${draft.id}`;
      if (draft.status === "CORRECTIONS_REQUIRED") {
        const last = draft.phaseTransitions[0];
        const remarks = last?.remarks?.trim();
        items.push(
          item({
            key: `${draft.id}:revision`,
            kind: "REVISION_REQUESTED",
            programme,
            text: `Revision requested${remarks ? `: ${remarks.length > 90 ? `${remarks.slice(0, 89)}…` : remarks}` : ""}`,
            href,
            since: last?.transitionedAt ?? null,
          }),
        );
      }
      if (draft.comments.length > 0) {
        items.push(
          item({
            key: `${draft.id}:comments`,
            kind: "OPEN_COMMENTS",
            programme,
            text: `${draft.comments.length} open ${draft.comments.length === 1 ? "comment" : "comments"} to answer`,
            href,
            since: draft.comments[0].createdAt,
          }),
        );
      }
      const progress = calculateSubmissionProgress({
        content: draft.content,
        activeStaffCount: draft.programme.department._count.staff,
        courses: draft.courses.map((course) => ({
          isGeneralEducation: isGeneralEducationCourse(course),
          ownedElsewhere: isOwnedElsewhere(course, programmePlace(draft.programme)),
          description: course.description,
        })),
        courseListConfirmed: confirmedLists.has(draft.id),
      });
      const unfinished = progress.sections.filter((section) => !section.complete);
      if (unfinished.length > 0) {
        items.push(
          item({
            key: `${draft.id}:sections`,
            kind: "SECTIONS_TO_FINISH",
            programme,
            text: `${unfinished.length} of ${progress.sections.length} sections to finish: ${unfinished.map((section) => (section.hint ? `${section.label} (${section.hint})` : section.label)).join(", ")}`,
            href: `${href}?section=${unfinished[0].key}`,
            since: draft.createdAt,
          }),
        );
      }
    }
    return orderWaiting(items);
  }

  // Deans: programmes from their school waiting for review (Phase 2).
  if (user.role === "DEAN") {
    if (!user.schoolId) return [];
    const drafts = await prisma.submission.findMany({
      where: { cycleId: cycle.id, currentPhase: 2, status: "IN_REVIEW", programme: { department: { schoolId: user.schoolId } } },
      select: { id: true, submittedAt: true, programme: { select: { name: true } }, phaseTransitions: lastTransition },
    });
    return orderWaiting(
      drafts.map((draft) =>
        item({
          key: `${draft.id}:review`,
          kind: "WAITING_FOR_REVIEW",
          programme: draft.programme.name,
          text: `Waiting for your review at ${PHASE_NAMES[2]}`,
          href: `/submissions/${draft.id}`,
          since: draft.phaseTransitions[0]?.transitionedAt ?? draft.submittedAt,
        }),
      ),
    );
  }

  // Academic Planning: the vetting queue (Phase 3 on), for an officer's own
  // school when the roster links them to one.
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    const scope: Prisma.SubmissionWhereInput =
      user.role === "ADMIN" && user.schoolId ? { programme: { department: { schoolId: user.schoolId } } } : {};
    const drafts = await prisma.submission.findMany({
      where: { cycleId: cycle.id, currentPhase: { gte: 3 }, status: "IN_REVIEW", ...scope },
      select: { id: true, currentPhase: true, programme: { select: { name: true } }, phaseTransitions: lastTransition },
    });
    return orderWaiting([
      ...drafts.map((draft) =>
        item({
          key: `${draft.id}:vetting`,
          kind: "VETTING",
          programme: draft.programme.name,
          text: `At ${PHASE_NAMES[draft.currentPhase]}`,
          href: `/submissions/${draft.id}`,
          since: draft.phaseTransitions[0]?.transitionedAt ?? null,
        }),
      ),
      ...(await academicPlanningQueues(user, scope, now)).map(item),
    ]);
  }
  return [];
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * T1, the other desks in R1: Academic Planning's own queues (Ask DAP
 * questions and course requests, for an officer's school when the roster
 * links them to one) and, for the General Education desk that DAP runs
 * (DEC8), its courses still missing text and the courses with no owner.
 */
async function academicPlanningQueues(
  user: ApiUser,
  scope: Prisma.SubmissionWhereInput,
  now: Date,
): Promise<{ key: string; kind: WaitingKind; programme: string; text: string; href: string; since: Date | null }[]> {
  const queues: { key: string; kind: WaitingKind; programme: string; text: string; href: string; since: Date | null }[] = [];
  const questions = await prisma.dapQuestion.findMany({
    // An officer: their school's questions and any sent to them. DAP-wide: all.
    where: Object.keys(scope).length ? { status: "OPEN", OR: [{ submission: scope }, { officerId: user.id }] } : { status: "OPEN" },
    select: { askedAt: true, dueAt: true },
    orderBy: { askedAt: "asc" },
  });
  if (questions.length > 0) {
    const late = questions.filter((question) => question.dueAt < now).length;
    queues.push({
      key: "dap-questions",
      kind: "QUESTIONS",
      programme: "Ask DAP",
      text: `${plural(questions.length, "question", "questions")} waiting for an answer${late ? `; ${late} past the one working day` : ""}`,
      href: "/dap-questions",
      since: questions[0].askedAt,
    });
  }
  const requests = await prisma.courseChangeRequest.findMany({
    where: { status: "OPEN", submission: scope },
    select: { requestedAt: true },
    orderBy: { requestedAt: "asc" },
  });
  if (requests.length > 0) {
    queues.push({
      key: "course-requests",
      kind: "COURSE_REQUESTS",
      programme: "Course requests",
      text: `${plural(requests.length, "course-list request", "course-list requests")} to answer`,
      href: "/course-requests",
      since: requests[0].requestedAt,
    });
  }
  // The General Education desk and the owner list are DAP-wide.
  if (user.role === "SUPER_ADMIN" || !user.schoolId) {
    const complete = (course: { learningOutcomes: unknown; courseContent: string | null }) =>
      normalizeLearningOutcomes(course.learningOutcomes).length >= MINIMUM_OUTCOMES && Boolean(course.courseContent?.trim());
    const general = await prisma.masterCourse.findMany({
      where: { AND: [OFFERED_COURSE, GENERAL_EDUCATION_WHERE] },
      select: { learningOutcomes: true, courseContent: true },
    });
    const missing = general.filter((course) => !complete(course)).length;
    if (missing > 0) {
      queues.push({
        key: "general-education",
        kind: "GENERAL_EDUCATION",
        programme: "General Education desk",
        text: `${plural(missing, "GST, BU-GST or ENT course needs", "GST, BU-GST and ENT courses need")} learning outcomes and content`,
        href: "/courses-we-own?owner=ge",
        since: null,
      });
    }
    const unowned = await prisma.masterCourse.findMany({
      where: { AND: [OFFERED_COURSE, { ownerDeptId: null, ownerSchoolId: null }] },
      select: { code: true },
    });
    const noOwner = unowned.filter((course) => !isGeneralEducationFamily(course.code)).length;
    if (noOwner > 0) {
      queues.push({
        key: "no-owner",
        kind: "NO_OWNER",
        programme: "Course Owners",
        text: `${plural(noOwner, "course has", "courses have")} no owner yet`,
        href: "/courses-we-own?owner=none",
        since: null,
      });
    }
  }
  return queues;
}
