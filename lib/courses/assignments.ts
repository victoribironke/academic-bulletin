/**
 * Task G2: the Head gives courses to lecturers. A lecturer sees only the
 * courses given to them, writes the description and learning outcomes,
 * runs the GRACE check and marks the course "Ready for my Head". The Head
 * accepts it, or returns it with a note. Only the Head submits the
 * programme, and V20 asks the Head to decide on every course given out.
 */
import type { AssignmentStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { canWriteSubmission, type ApiUser } from "@/lib/api-auth";
import { isGeneralEducationCourse } from "@/lib/courses/general-education";

export class AssignmentError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  ASSIGNED: "With the lecturer",
  READY: "Ready for the Head",
  ACCEPTED: "Accepted by the Head",
  RETURNED: "Returned to the lecturer",
};

/** A lecturer may edit while the course is with them, at the department's phase. */
export async function lecturerAssignment(lecturerId: string, courseId: string) {
  const assignment = await prisma.courseAssignment.findUnique({
    where: { courseId },
    select: {
      id: true,
      status: true,
      lecturerId: true,
      submission: { select: { currentPhase: true, cycle: { select: { archivedAt: true } } } },
    },
  });
  if (!assignment || assignment.lecturerId !== lecturerId) return null;
  return assignment;
}

export async function canLecturerEditCourse(lecturerId: string, courseId: string): Promise<boolean> {
  const assignment = await lecturerAssignment(lecturerId, courseId);
  return Boolean(
    assignment &&
      (assignment.status === "ASSIGNED" || assignment.status === "RETURNED") &&
      assignment.submission.currentPhase === 1 &&
      !assignment.submission.cycle?.archivedAt,
  );
}

/** The Head's lecturers, and the department's draft courses with who has each. */
export async function assignmentsFor(user: ApiUser, submissionId: string) {
  const draft = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    select: {
      programme: { select: { departmentId: true } },
      courses: {
        select: {
          id: true,
          code: true,
          title: true,
          level: true,
          masterCourse: { select: { type: true, ownership: true } },
          assignment: { select: { id: true, status: true, note: true, updatedAt: true, lecturer: { select: { id: true, firstName: true, lastName: true } } } },
        },
        orderBy: [{ level: "asc" }, { code: "asc" }],
      },
    },
  });
  const lecturers = await prisma.user.findMany({
    where: { role: "LECTURER", isActive: true, departmentId: draft.programme.departmentId },
    select: { id: true, firstName: true, lastName: true, email: true, firstSignInAt: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const courses = draft.courses
    .filter((course) => !isGeneralEducationCourse(course))
    .map((course) => ({
      id: course.id,
      code: course.code,
      title: course.title,
      level: course.level,
      assignment: course.assignment
        ? {
            id: course.assignment.id,
            status: course.assignment.status,
            note: course.assignment.note,
            updatedAt: course.assignment.updatedAt.toISOString(),
            lecturer: { id: course.assignment.lecturer.id, name: `${course.assignment.lecturer.firstName} ${course.assignment.lecturer.lastName}`.trim() },
          }
        : null,
    }));
  const counts: Record<AssignmentStatus, number> = { ASSIGNED: 0, READY: 0, ACCEPTED: 0, RETURNED: 0 };
  for (const course of courses) if (course.assignment) counts[course.assignment.status] += 1;
  return {
    lecturers: lecturers.map((lecturer) => ({
      id: lecturer.id,
      name: `${lecturer.firstName} ${lecturer.lastName}`.trim(),
      email: lecturer.email,
      signedIn: Boolean(lecturer.firstSignInAt),
    })),
    courses,
    counts,
    canEdit: await canWriteSubmission(user, submissionId),
  };
}

/** Gives a course to a lecturer of the department, or (lecturerId null) takes it back. */
export async function assignCourse(head: ApiUser, submissionId: string, courseId: string, lecturerId: string | null) {
  if (!(await canWriteSubmission(head, submissionId))) throw new AssignmentError("You can't edit this programme now.", 403);
  const course = await prisma.course.findFirst({
    where: { id: courseId, submissionId },
    select: { id: true, code: true, masterCourse: { select: { type: true, ownership: true } }, submission: { select: { programme: { select: { departmentId: true } } } } },
  });
  if (!course) throw new AssignmentError("That course isn't on this draft.", 404);
  if (isGeneralEducationCourse(course)) throw new AssignmentError("General Education courses are written at the General Education desk.");
  if (lecturerId === null) {
    const removed = await prisma.courseAssignment.deleteMany({ where: { courseId } });
    if (removed.count) {
      await recordActivity({
        actorId: head.id,
        action: "COURSE_UNASSIGNED",
        entityType: "SUBMISSION",
        entityId: submissionId,
        description: `Took ${course.code} back from its lecturer.`,
        metadata: { courseId },
      });
    }
    return;
  }
  const lecturer = await prisma.user.findFirst({
    where: { id: lecturerId, role: "LECTURER", isActive: true, departmentId: course.submission.programme.departmentId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!lecturer) throw new AssignmentError("Choose one of your department's lecturers.", 400);
  await prisma.courseAssignment.upsert({
    where: { courseId },
    create: { courseId, submissionId, lecturerId, assignedById: head.id },
    update: { lecturerId, status: "ASSIGNED", note: null, assignedById: head.id },
  });
  await recordActivity({
    actorId: head.id,
    action: "COURSE_ASSIGNED",
    entityType: "SUBMISSION",
    entityId: submissionId,
    description: `Gave ${course.code} to ${lecturer.firstName} ${lecturer.lastName} to write its description.`,
    metadata: { courseId, lecturerId },
  });
}

/** The Head accepts a course the lecturer marked ready, or returns it with a note. */
export async function decideAssignment(head: ApiUser, submissionId: string, assignmentId: string, action: unknown, note: unknown) {
  if (!(await canWriteSubmission(head, submissionId))) throw new AssignmentError("You can't edit this programme now.", 403);
  if (head.role === "LECTURER" || head.role === "COMMITTEE_MEMBER" || head.role === "PROGRAMME_COORDINATOR") {
    throw new AssignmentError("Only the Head of Department accepts or returns a lecturer's work.", 403);
  }
  const assignment = await prisma.courseAssignment.findFirst({
    where: { id: assignmentId, submissionId },
    select: { id: true, status: true, course: { select: { code: true } }, lecturerId: true },
  });
  if (!assignment) throw new AssignmentError("That course isn't given to a lecturer on this draft.", 404);
  if (action !== "accept" && action !== "return") throw new AssignmentError("Accept it, or return it with a note.");
  const text = typeof note === "string" ? note.trim() : "";
  if (action === "return" && (text.length < 10 || text.length > 1000)) {
    throw new AssignmentError("Say what to change, in 10 to 1,000 characters.");
  }
  const status: AssignmentStatus = action === "accept" ? "ACCEPTED" : "RETURNED";
  await prisma.courseAssignment.update({ where: { id: assignmentId }, data: { status, note: action === "return" ? text : null } });
  await recordActivity({
    actorId: head.id,
    action: action === "accept" ? "COURSE_WORK_ACCEPTED" : "COURSE_WORK_RETURNED",
    entityType: "SUBMISSION",
    entityId: submissionId,
    description:
      action === "accept"
        ? `Accepted the lecturer's description of ${assignment.course.code}.`
        : `Returned ${assignment.course.code} to the lecturer: ${text}`,
    metadata: { assignmentId, lecturerId: assignment.lecturerId },
  });
}

/** The lecturer's own courses, with where each stands. */
export async function lecturerCourses(lecturerId: string) {
  const assignments = await prisma.courseAssignment.findMany({
    where: { lecturerId, submission: { cycle: { archivedAt: null } } },
    select: {
      id: true,
      status: true,
      note: true,
      updatedAt: true,
      course: {
        select: {
          id: true,
          code: true,
          title: true,
          units: true,
          level: true,
          description: { select: { learningOutcomes: true, courseContent: true, graceStatus: true, gracePass: true } },
        },
      },
      submission: { select: { id: true, currentPhase: true, programme: { select: { name: true } } } },
    },
    orderBy: [{ submission: { programme: { name: "asc" } } }, { course: { code: "asc" } }],
  });
  return assignments.map((assignment) => ({
    id: assignment.id,
    status: assignment.status,
    note: assignment.note,
    updatedAt: assignment.updatedAt.toISOString(),
    programme: assignment.submission.programme.name,
    canEdit: (assignment.status === "ASSIGNED" || assignment.status === "RETURNED") && assignment.submission.currentPhase === 1,
    course: {
      id: assignment.course.id,
      code: assignment.course.code,
      title: assignment.course.title,
      units: assignment.course.units,
      level: assignment.course.level,
      learningOutcomes: Array.isArray(assignment.course.description?.learningOutcomes)
        ? (assignment.course.description!.learningOutcomes as unknown[]).map(String)
        : [],
      courseContent: assignment.course.description?.courseContent ?? "",
      graceStatus: assignment.course.description?.graceStatus ?? null,
      gracePass: assignment.course.description?.gracePass ?? false,
    },
  }));
}

/** The lecturer marks a course "Ready for my Head": it needs content and three outcomes. */
export async function markReady(lecturer: ApiUser, assignmentId: string) {
  const assignment = await prisma.courseAssignment.findFirst({
    where: { id: assignmentId, lecturerId: lecturer.id },
    select: {
      id: true,
      status: true,
      submissionId: true,
      course: { select: { id: true, code: true, description: { select: { learningOutcomes: true, courseContent: true } } } },
    },
  });
  if (!assignment) throw new AssignmentError("That course isn't one of yours.", 404);
  if (!(await canLecturerEditCourse(lecturer.id, assignment.course.id))) {
    throw new AssignmentError("This course is with your Head now.", 409);
  }
  const outcomes = Array.isArray(assignment.course.description?.learningOutcomes)
    ? (assignment.course.description!.learningOutcomes as unknown[]).map(String).filter((item) => item.trim())
    : [];
  if (!assignment.course.description?.courseContent?.trim() || outcomes.length < 3) {
    throw new AssignmentError("Write the course content and at least three learning outcomes first.");
  }
  await prisma.courseAssignment.update({ where: { id: assignmentId }, data: { status: "READY", note: null } });
  await recordActivity({
    actorId: lecturer.id,
    action: "COURSE_WORK_READY",
    entityType: "SUBMISSION",
    entityId: assignment.submissionId,
    description: `Marked ${assignment.course.code} ready for the Head of Department.`,
    metadata: { assignmentId },
  });
}
