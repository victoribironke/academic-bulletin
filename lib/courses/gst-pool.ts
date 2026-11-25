import prisma from "@/lib/prisma";
import { titleKey, uniqueTitle } from "@/lib/courses/unique-title";
import { effectiveCourseValues, loadProgrammeValues } from "@/lib/courses/programme-values";
import { generalEducationBlockFor, programmeLevels } from "@/lib/courses/general-education";
import {
  applyCourseStructure,
  loadRegistryCourses,
  planCourseStructure,
  seedRegistryDescription,
} from "@/lib/courses/course-structure";

const EDITABLE_SUBMISSION_STATUSES = ["DRAFT", "CORRECTIONS_REQUIRED"] as const;

export type RegistryPreloadResult = {
  submissionId: string;
  available: number;
  added: number;
  linked: number;
};

/**
 * Makes a draft's Registry courses available in it:
 * 1. the General Education block of section 6.1 for every level the
 *    programme runs (rule W1), from the Registry where it has the course and
 *    from section 6.1 where it doesn't yet; and
 * 2. every discoverable Registry course linked to the programme.
 * Existing rows are kept as they are (only linked to the Registry); missing
 * ones get the Registry values as their starting point.
 */
export async function preloadRegistryCoursesForSubmission(
  submissionId: string,
): Promise<RegistryPreloadResult> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      programmeId: true,
      status: true,
      dismissedRegistryCourseIds: true,
      programme: { select: { duration: true } },
    },
  });

  if (
    !submission ||
    !EDITABLE_SUBMISSION_STATUSES.includes(
      submission.status as (typeof EDITABLE_SUBMISSION_STATUSES)[number],
    )
  ) {
    return { submissionId, available: 0, added: 0, linked: 0 };
  }

  // 1. The General Education block (W1): always present, never dismissed.
  const levels = programmeLevels(submission.programme.duration);
  const block = generalEducationBlockFor(levels);
  const blockCodes = new Set(block.map((course) => course.code));
  const before = await prisma.course.findMany({
    where: { submissionId },
    select: { code: true, title: true, masterCourseId: true },
  });
  const blockRegistry = await loadRegistryCourses(prisma, [...blockCodes]);
  const blockPlan = planCourseStructure({
    levels,
    rows: [],
    registry: blockRegistry,
    existing: before,
    programmeValues: await loadProgrammeValues(prisma, submission.programmeId),
  });
  const blockAdded = await applyCourseStructure(prisma, submission, blockPlan);
  // Block rows already there are linked once their Registry record exists.
  let blockLinked = 0;
  for (const course of before) {
    const master = blockRegistry.get(course.code);
    if (!blockCodes.has(course.code) || !master || course.masterCourseId === master.id) continue;
    await prisma.course.update({
      where: { code_submissionId: { code: course.code, submissionId } },
      data: { masterCourseId: master.id },
    });
    await prisma.programmeCourse.createMany({
      data: [{ programmeId: submission.programmeId, courseId: master.id, isCore: true }],
      skipDuplicates: true,
    });
    blockLinked += 1;
  }

  // 2. Registry courses linked to the programme. G6: courses the department
  // removed stay removed.
  const registryCourses = await prisma.masterCourse.findMany({
    where: {
      discoverable: true,
      code: { notIn: [...blockCodes] },
      programmeLinks: { some: { programmeId: submission.programmeId } },
    },
    include: {
      prerequisites: { select: { code: true } },
      programmeLinks: {
        where: { programmeId: submission.programmeId },
        select: {
          isCore: true,
          titleOverride: true,
          unitsOverride: true,
          typeOverride: true,
          semesterOverride: true,
          levelOverride: true,
          learningOutcomesOverride: true,
          courseContentOverride: true,
        },
      },
    },
    orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
  });

  const dismissed = new Set(submission.dismissedRegistryCourseIds);
  const wanted = registryCourses.filter((course) => !dismissed.has(course.id));

  const existing = await prisma.course.findMany({
    where: { submissionId },
    select: { id: true, code: true, title: true, masterCourseId: true },
  });
  const existingCodes = new Set(existing.map((course) => course.code));
  // Course titles are unique per submission. Some Registry courses share a
  // title (e.g. GST 112 and GST 113), so later ones get their code appended.
  const takenTitles = new Set(existing.map((course) => titleKey(course.title)));
  let added = blockAdded.added;
  let linked = blockLinked;

  for (const master of wanted) {
    const programmeLink = master.programmeLinks[0];
    const values = effectiveCourseValues(master, programmeLink);
    const wasPresent = existingCodes.has(master.code);
    const title = wasPresent
      ? (programmeLink?.titleOverride || master.title)
      : uniqueTitle(programmeLink?.titleOverride || master.title, master.code, takenTitles);
    if (!wasPresent) takenTitles.add(titleKey(title));
    const course = await prisma.course.upsert({
      where: {
        code_submissionId: { code: master.code, submissionId },
      },
      create: {
        submissionId,
        masterCourseId: master.id,
        code: master.code,
        title,
        units: values.units,
        status: values.status,
        semester: values.semester,
        level: values.level,
        prerequisites:
          master.prerequisites.map((item) => item.code).join(", ") || null,
      },
      update: { masterCourseId: master.id },
      select: { id: true },
    });

    if (wasPresent) linked += 1;
    else added += 1;

    await seedRegistryDescription(prisma, {
      courseId: course.id,
      submissionId,
      title,
      master,
      programmeLink,
    });
  }

  return {
    submissionId,
    available: wanted.length + block.length,
    added,
    linked,
  };
}

// Backwards-compatible name used by existing routes. The broader function now
// includes programme-linked CCMAS/Registry courses as well as university-wide GST.
export const preloadGstCoursesForSubmission = preloadRegistryCoursesForSubmission;
