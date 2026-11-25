/**
 * Task B6: "Courses we own". Each owner sees the courses it teaches for the
 * university, with the programmes that use each one, and writes their
 * learning outcomes and content once for all of them (rule W16).
 *
 *   Heads of Department and programme coordinators: their department's
 *     courses, and their school's where the school owns a course. They edit.
 *   Deans: every course owned in their school. They read.
 *   DAP's administrators: any owner's list, the General Education desk's
 *     (GST, BU-GST and ENT, decision DEC8) and the courses with no owner yet.
 *     They edit.
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { ApiUser } from "@/lib/api-auth";
import { isGeneralEducationFamily } from "@/lib/courses/general-education";
import { normalizeLearningOutcomes } from "@/lib/courses/grace-compliance";
import { OFFERED_COURSE } from "@/lib/courses/course-owners";

/** "dept:<id>", "school:<id>", "ge" (the General Education desk) or "none". */
export type OwnerKey = string;

export const GENERAL_EDUCATION_DESK = "General Education desk";

/** W15: at least three learning outcomes, and the course content. */
export const MINIMUM_OUTCOMES = 3;

const GENERAL_EDUCATION_WHERE: Prisma.MasterCourseWhereInput = {
  OR: [
    { code: { startsWith: "GST " } },
    { code: { startsWith: "BU-GST " } },
    { code: { startsWith: "ENT " } },
    { code: { startsWith: "BU-ENT " } },
  ],
};

export type OwnedCourse = {
  id: string;
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number | null;
  owner: string;
  programmes: { code: string; name: string }[];
  learningOutcomes: string[];
  courseContent: string;
  labWork: string;
  entrepreneurialAspect: string;
  complete: boolean;
};

export type OwnerChoice = { key: OwnerKey; name: string; count: number };

export type CoursesWeOwn = {
  owner: { key: OwnerKey; name: string };
  canEdit: boolean;
  courses: OwnedCourse[];
  /** Administrators only: every owner, with how many courses each has. */
  owners?: OwnerChoice[];
};

type Scope = { where: Prisma.MasterCourseWhereInput; owner: { key: OwnerKey; name: string }; canEdit: boolean };

async function scopeFor(user: ApiUser, requested: OwnerKey | null): Promise<Scope | null> {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    const key = requested || "ge";
    if (key === "ge") return { where: GENERAL_EDUCATION_WHERE, owner: { key, name: GENERAL_EDUCATION_DESK }, canEdit: true };
    if (key === "none") {
      return {
        where: { AND: [{ ownerDeptId: null, ownerSchoolId: null }, { NOT: GENERAL_EDUCATION_WHERE }] },
        owner: { key, name: "No owner yet" },
        canEdit: true,
      };
    }
    const [kind, id] = key.split(":");
    if (kind === "dept" && id) {
      const department = await prisma.department.findUnique({ where: { id }, select: { name: true } });
      return department ? { where: { ownerDeptId: id }, owner: { key, name: department.name }, canEdit: true } : null;
    }
    if (kind === "school" && id) {
      const school = await prisma.school.findUnique({ where: { id }, select: { name: true } });
      return school ? { where: { ownerDeptId: null, ownerSchoolId: id }, owner: { key, name: school.name }, canEdit: true } : null;
    }
    return null;
  }
  if ((user.role === "HOD" || user.role === "PROGRAMME_COORDINATOR") && user.departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: user.departmentId },
      select: { id: true, name: true, schoolId: true },
    });
    if (!department) return null;
    return {
      where: { OR: [{ ownerDeptId: department.id }, { ownerDeptId: null, ownerSchoolId: department.schoolId }] },
      owner: { key: `dept:${department.id}`, name: department.name },
      canEdit: true,
    };
  }
  if (user.role === "DEAN" && user.schoolId) {
    const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { id: true, name: true } });
    if (!school) return null;
    return {
      where: { OR: [{ ownerSchoolId: school.id }, { ownerDepartment: { schoolId: school.id } }] },
      owner: { key: `school:${school.id}`, name: school.name },
      canEdit: false,
    };
  }
  return null;
}

async function ownerChoices(): Promise<OwnerChoice[]> {
  const courses = await prisma.masterCourse.findMany({
    where: OFFERED_COURSE,
    select: {
      code: true,
      ownerDeptId: true,
      ownerSchoolId: true,
      ownerDepartment: { select: { name: true } },
      ownerSchool: { select: { name: true } },
    },
  });
  const choices = new Map<OwnerKey, OwnerChoice>();
  const add = (key: OwnerKey, name: string) => {
    const choice = choices.get(key) ?? { key, name, count: 0 };
    choice.count += 1;
    choices.set(key, choice);
  };
  for (const course of courses) {
    if (isGeneralEducationFamily(course.code)) add("ge", GENERAL_EDUCATION_DESK);
    else if (course.ownerDeptId) add(`dept:${course.ownerDeptId}`, course.ownerDepartment?.name ?? "Department");
    else if (course.ownerSchoolId) add(`school:${course.ownerSchoolId}`, course.ownerSchool?.name ?? "School");
    else add("none", "No owner yet");
  }
  const special = ["ge", "none"].map((key) => choices.get(key)).filter((choice): choice is OwnerChoice => Boolean(choice));
  const units = [...choices.values()].filter((choice) => choice.key !== "ge" && choice.key !== "none").sort((a, b) => a.name.localeCompare(b.name));
  return [...special, ...units];
}

export async function loadCoursesWeOwn(user: ApiUser, requested: OwnerKey | null): Promise<CoursesWeOwn | null> {
  const scope = await scopeFor(user, requested);
  if (!scope) return null;
  const isAdministrator = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const courses = await prisma.masterCourse.findMany({
    where: { AND: [OFFERED_COURSE, scope.where] },
    select: {
      id: true,
      code: true,
      title: true,
      units: true,
      level: true,
      semester: true,
      learningOutcomes: true,
      courseContent: true,
      labWork: true,
      entrepreneurialAspect: true,
      ownerDepartment: { select: { name: true } },
      ownerSchool: { select: { name: true } },
      programmeLinks: { select: { programme: { select: { code: true, name: true } } }, orderBy: { programme: { code: "asc" } } },
    },
    orderBy: [{ level: "asc" }, { code: "asc" }],
  });
  return {
    owner: scope.owner,
    canEdit: scope.canEdit,
    ...(isAdministrator && { owners: await ownerChoices() }),
    courses: courses
      // A department's list leaves General Education to its desk (DEC8).
      .filter((course) => scope.owner.key === "ge" || !isGeneralEducationFamily(course.code))
      .map((course) => {
        const learningOutcomes = normalizeLearningOutcomes(course.learningOutcomes);
        const courseContent = course.courseContent?.trim() ?? "";
        return {
          id: course.id,
          code: course.code,
          title: course.title,
          units: course.units,
          level: course.level,
          semester: course.semester,
          owner: isGeneralEducationFamily(course.code)
            ? GENERAL_EDUCATION_DESK
            : (course.ownerDepartment?.name ?? course.ownerSchool?.name ?? "No owner yet"),
          programmes: course.programmeLinks.map((link) => link.programme),
          learningOutcomes,
          courseContent,
          labWork: course.labWork?.trim() ?? "",
          entrepreneurialAspect: course.entrepreneurialAspect?.trim() ?? "",
          complete: learningOutcomes.length >= MINIMUM_OUTCOMES && courseContent.length > 0,
        };
      }),
  };
}

/**
 * May this person write the course's learning outcomes and content from
 * "Courses we own"? DAP's administrators always; Heads of Department and
 * programme coordinators when their department (or school) owns it. General
 * Education is the General Education desk's, which DAP runs (DEC8).
 */
export async function canWriteOwnedCourse(
  user: ApiUser,
  course: { code: string; ownerDeptId: string | null; ownerSchoolId: string | null },
): Promise<boolean> {
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return true;
  if (!(user.role === "HOD" || user.role === "PROGRAMME_COORDINATOR") || !user.departmentId) return false;
  if (isGeneralEducationFamily(course.code)) return false;
  if (course.ownerDeptId) return course.ownerDeptId === user.departmentId;
  if (!course.ownerSchoolId) return false;
  const department = await prisma.department.findUnique({ where: { id: user.departmentId }, select: { schoolId: true } });
  return department?.schoolId === course.ownerSchoolId;
}
