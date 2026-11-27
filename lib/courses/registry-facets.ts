/**
 * Task K5 on the server: the Registry rows a person may see, with what the
 * filters need (school, department, programmes, source, description, GRACE).
 */
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { courseGraceContentHash } from "@/lib/courses/grace-compliance";
import type { RegistryRow } from "@/lib/courses/registry-filters";

export async function loadRegistryRows(where: Prisma.MasterCourseWhereInput): Promise<RegistryRow[]> {
  const courses = await prisma.masterCourse.findMany({
    where,
    select: {
      id: true,
      title: true,
      level: true,
      semester: true,
      type: true,
      ownership: true,
      curriculumSource: true,
      courseContent: true,
      learningOutcomes: true,
      ownerDepartment: { select: { id: true, name: true, school: { select: { id: true, name: true } } } },
      ownerSchool: { select: { id: true, name: true } },
      programmeLinks: { select: { programme: { select: { id: true, name: true } } } },
    },
  });
  const hashes = new Map<string, string>();
  for (const course of courses) {
    const hash = courseGraceContentHash({ title: course.title, courseContent: course.courseContent, learningOutcomes: course.learningOutcomes });
    if (hash) hashes.set(course.id, hash);
  }
  const checked = new Set(
    (
      await prisma.graceAssessment.findMany({
        where: { contentHash: { in: [...new Set(hashes.values())] }, status: { in: ["COMPLIANT", "NEEDS_REVISION"] } },
        select: { contentHash: true },
      })
    ).map((item) => item.contentHash),
  );
  const outcomes = (value: unknown) => (Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).length : 0);
  return courses.map((course) => ({
    id: course.id,
    level: course.level,
    semester: course.semester,
    type: course.type,
    ownership: course.ownership,
    school: course.ownerDepartment?.school ?? course.ownerSchool ?? null,
    department: course.ownerDepartment ? { id: course.ownerDepartment.id, name: course.ownerDepartment.name } : null,
    programmes: course.programmeLinks.map((link) => link.programme),
    source: course.curriculumSource?.trim() || null,
    hasDescription: Boolean(course.courseContent?.trim()) && outcomes(course.learningOutcomes) > 0,
    grace: !hashes.has(course.id) ? "NO_TEXT" : checked.has(hashes.get(course.id)!) ? "CHECKED" : "NOT_CHECKED",
  }));
}
