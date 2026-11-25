/**
 * Rule W16: shared courses. One Registry course serves every programme that
 * uses it (ACC 101 serves five). The department or school that owns it (B6)
 * writes its learning outcomes and course content; every programme sees the
 * same text. A programme keeps its own units, semester, level and core or
 * elective status on its link to the course (B14).
 *
 * In a draft, a row linked to the Registry is one of three kinds:
 *   OWNER   the programme's department (or school) owns the course: its
 *           description is saved on the Registry course and reaches every
 *           open draft that uses it.
 *   LOCAL   the programme's own row (not in the Registry), or a Registry
 *           course nobody owns yet: the text stays in this draft.
 *   LOCKED  another department owns it, or it is General Education (W1)
 *           and this department isn't its host: read-only here, and not
 *           this Head of Department's progress (G5).
 * DAP's administrators may edit any row; a Registry row then works as OWNER.
 */
import type { Prisma } from "@prisma/client";
import type prisma from "@/lib/prisma";
import { isGeneralEducationCourse, isGeneralEducationFamily } from "@/lib/courses/general-education";
import { normalizeLearningOutcomes, prepareCourseGraceState } from "@/lib/courses/grace-compliance";
import { propagateMasterCourseChanges } from "@/lib/courses/propagation";
import { recordActivity, AUTOSAVE_COALESCE_MINUTES } from "@/lib/activity-log";

export type DescriptionAccess = "OWNER" | "LOCAL" | "LOCKED";

export type CourseOwner = {
  type: string;
  ownership: string;
  ownerDeptId: string | null;
  ownerSchoolId: string | null;
  ownerDepartment?: { name: string } | null;
  ownerSchool?: { name: string } | null;
};

/** Where a programme sits: its department and that department's school. */
export type ProgrammePlace = { departmentId: string; schoolId: string };

export const SHARED_COURSE_LOCKED_CODE = "SHARED_COURSE_LOCKED";

/** Selects what the rules below need from a draft row's Registry course. */
export const COURSE_OWNER_SELECT = {
  type: true,
  ownership: true,
  ownerDeptId: true,
  ownerSchoolId: true,
  ownerDepartment: { select: { name: true } },
  ownerSchool: { select: { name: true } },
} as const satisfies Prisma.MasterCourseSelect;

/** Selects a draft's programme place. */
export const PROGRAMME_PLACE_SELECT = {
  departmentId: true,
  department: { select: { schoolId: true } },
} as const satisfies Prisma.ProgrammeSelect;

export function programmePlace(programme: { departmentId: string; department: { schoolId: string } }): ProgrammePlace {
  return { departmentId: programme.departmentId, schoolId: programme.department.schoolId };
}

/** True when the programme's department (or school) owns the course; null when nobody does. */
export function ownsCourse(owner: CourseOwner, place: ProgrammePlace): boolean | null {
  if (owner.ownerDeptId) return owner.ownerDeptId === place.departmentId;
  if (owner.ownerSchoolId) return owner.ownerSchoolId === place.schoolId;
  return null;
}

/** The owner's name for the screen: "Basic and Applied Sciences". */
export function ownerName(owner: CourseOwner | null | undefined): string | null {
  if (!owner) return null;
  if (owner.ownerDeptId) return owner.ownerDepartment?.name ?? null;
  if (owner.ownerSchoolId) return owner.ownerSchool?.name ?? null;
  return null;
}

/** Who may write a draft row's learning outcomes and course content (see the top of this file). */
export function descriptionAccess(
  course: { code: string; masterCourse?: CourseOwner | null },
  place: ProgrammePlace,
  options: { isAdministrator?: boolean } = {},
): DescriptionAccess {
  const owner = course.masterCourse ?? null;
  const owns = owner ? ownsCourse(owner, place) : null;
  if (options.isAdministrator) return owner ? "OWNER" : "LOCAL";
  if (owns === true) return "OWNER";
  // DEC8: GST, BU-GST and ENT belong to the General Education desk.
  if (isGeneralEducationCourse(course) || isGeneralEducationFamily(course.code)) return "LOCKED";
  if (!owner || owns === null) return "LOCAL";
  return "LOCKED";
}

/** G5: a row another department writes is not this Head of Department's progress. */
export function isOwnedElsewhere(
  course: { code: string; masterCourse?: CourseOwner | null },
  place: ProgrammePlace,
): boolean {
  return descriptionAccess(course, place) === "LOCKED";
}

export function sharedCourseLockedMessage(owner: CourseOwner | null | undefined, code: string): string {
  const name = ownerName(owner);
  if (!name && (isGeneralEducationCourse({ code, masterCourse: owner }) || isGeneralEducationFamily(code))) {
    return "General Education courses are written by the General Education desk for every programme, so their description can't be changed here (rule W1). Ask DAP if something is wrong.";
  }
  return `${code} is taught by ${name ?? "another department"}, which writes its description for every programme that uses it (rule W16). Ask them, or DAP, if something is wrong.`;
}

export type TeachingText = {
  learningOutcomes: string[];
  courseContent: string | null;
  labWork: string | null;
  entrepreneurialAspect: string | null;
};

/**
 * W16: the owner saved a shared course's description, in a draft or on
 * "Courses we own" (B6). The text goes on the Registry course and into every
 * other open draft row that uses it (drafts under review or approved, and
 * archived cycles, stay as they are). Call it inside a transaction.
 */
export async function shareTeachingText(
  tx: Prisma.TransactionClient,
  input: { masterCourseId: string; sourceCourseId?: string; actorId: string; text: TeachingText },
): Promise<{ draftRowsUpdated: number; programmes: string[] }> {
  const course = await tx.masterCourse.update({
    where: { id: input.masterCourseId },
    data: input.text,
    select: { id: true, code: true, title: true },
  });
  const result = await propagateMasterCourseChanges(
    { id: course.id, ...input.text },
    { db: tx, exceptCourseId: input.sourceCourseId },
  );
  await recordActivity(
    {
      actorId: input.actorId,
      action: "SHARED_COURSE_TEXT_UPDATED",
      entityType: "MASTER_COURSE",
      entityId: course.id,
      description: `Updated the learning outcomes and course content of ${course.code} - ${course.title} for every programme that uses it.`,
      metadata: { sourceCourseId: input.sourceCourseId, draftRowsUpdated: result.updatedCount, programmes: result.affectedProgrammes },
      coalesceWithinMinutes: AUTOSAVE_COALESCE_MINUTES,
    },
    tx,
  );
  return { draftRowsUpdated: result.updatedCount, programmes: result.affectedProgrammes };
}

/**
 * W16: a Registry course added to a draft starts with the course's shared
 * text, so every programme shows the same description. Nothing is written
 * when the Registry has no text yet.
 */
export async function startDescriptionFromRegistry(
  db: Prisma.TransactionClient | typeof prisma,
  row: { id: string; title: string; submissionId: string; masterCourseId: string },
): Promise<void> {
  const master = await db.masterCourse.findUnique({
    where: { id: row.masterCourseId },
    select: { learningOutcomes: true, courseContent: true, labWork: true, entrepreneurialAspect: true },
  });
  if (!master) return;
  const learningOutcomes = normalizeLearningOutcomes(master.learningOutcomes);
  const courseContent = master.courseContent?.trim() || null;
  if (learningOutcomes.length === 0 && !courseContent && !master.labWork && !master.entrepreneurialAspect) return;
  const graceState = await prepareCourseGraceState(db, { title: row.title, learningOutcomes, courseContent });
  await db.courseDescription.upsert({
    where: { courseId: row.id },
    create: {
      courseId: row.id,
      submissionId: row.submissionId,
      learningOutcomes,
      courseContent,
      labWork: master.labWork || null,
      entrepreneurialAspect: master.entrepreneurialAspect || null,
      ...graceState,
    },
    update: {},
  });
}
