import prisma from "@/lib/prisma";
import { prepareCourseGraceState } from "@/lib/courses/grace-compliance";

const EDITABLE_SUBMISSION_STATUSES = ["DRAFT", "CORRECTIONS_REQUIRED"] as const;

export type RegistryPreloadResult = {
  submissionId: string;
  available: number;
  added: number;
  linked: number;
};

/**
 * Makes every discoverable Registry course assigned to a programme, plus all
 * university-wide GST courses, available in one submission. Existing local
 * edits are preserved; missing courses receive the Registry values as their
 * starting point.
 */
export async function preloadRegistryCoursesForSubmission(
  submissionId: string,
): Promise<RegistryPreloadResult> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { id: true, programmeId: true, status: true },
  });

  if (
    !submission ||
    !EDITABLE_SUBMISSION_STATUSES.includes(
      submission.status as (typeof EDITABLE_SUBMISSION_STATUSES)[number],
    )
  ) {
    return { submissionId, available: 0, added: 0, linked: 0 };
  }

  const registryCourses = await prisma.masterCourse.findMany({
    where: {
      discoverable: true,
      OR: [
        {
          ownership: "INSTITUTIONAL",
          type: { in: ["GST_NUC", "GST_BU"] },
        },
        {
          programmeLinks: {
            some: { programmeId: submission.programmeId },
          },
        },
      ],
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
          learningOutcomesOverride: true,
          courseContentOverride: true,
        },
      },
    },
    orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
  });

  if (registryCourses.length === 0) {
    return { submissionId, available: 0, added: 0, linked: 0 };
  }

  await prisma.programmeCourse.createMany({
    data: registryCourses.map((course) => ({
      programmeId: submission.programmeId,
      courseId: course.id,
      isCore: true,
    })),
    skipDuplicates: true,
  });

  const existing = await prisma.course.findMany({
    where: { submissionId },
    select: { id: true, code: true, masterCourseId: true },
  });
  const existingCodes = new Set(existing.map((course) => course.code));
  let added = 0;
  let linked = 0;

  for (const master of registryCourses) {
    const programmeLink = master.programmeLinks[0];
    const effectiveType = programmeLink?.typeOverride ?? master.type;
    const wasPresent = existingCodes.has(master.code);
    const course = await prisma.course.upsert({
      where: {
        code_submissionId: { code: master.code, submissionId },
      },
      create: {
        submissionId,
        masterCourseId: master.id,
        code: master.code,
        title: programmeLink?.titleOverride || master.title,
        units: programmeLink?.unitsOverride ?? master.units,
        status:
          effectiveType === "ELECTIVE" || programmeLink?.isCore === false
            ? "ELECTIVE"
            : "CORE",
        semester: programmeLink?.semesterOverride ?? master.semester,
        level: master.level,
        prerequisites:
          master.prerequisites.map((item) => item.code).join(", ") || null,
      },
      update: { masterCourseId: master.id },
      select: { id: true },
    });

    if (wasPresent) linked += 1;
    else added += 1;

    // Seed the shared Registry description only when a programme has not
    // already supplied its own details. HoDs retain editorial control over
    // the preloaded copy in their submission.
    const effectiveLearningOutcomes =
      programmeLink?.learningOutcomesOverride ?? master.learningOutcomes;
    const learningOutcomes = Array.isArray(effectiveLearningOutcomes)
      ? effectiveLearningOutcomes.filter(
          (item): item is string => typeof item === "string" && item.trim() !== "",
        )
      : [];
    const courseContent =
      programmeLink?.courseContentOverride?.trim() ||
      master.courseContent?.trim() ||
      master.description?.trim() ||
      "";
    const hasCentralDetails =
      learningOutcomes.length > 0 ||
      courseContent ||
      master.labWork?.trim() ||
      master.entrepreneurialAspect?.trim();
    if (hasCentralDetails) {
      const description = await prisma.courseDescription.findUnique({
        where: { courseId: course.id },
        select: { id: true },
      });
      if (!description) {
        const graceState = await prepareCourseGraceState(prisma, {
          title: programmeLink?.titleOverride || master.title,
          learningOutcomes,
          courseContent,
        });
        await prisma.courseDescription.create({
          data: {
            courseId: course.id,
            submissionId,
            courseContent: courseContent || null,
            learningOutcomes,
            labWork: master.labWork?.trim() || null,
            entrepreneurialAspect:
              master.entrepreneurialAspect?.trim() || null,
            ...graceState,
          },
        });
      }
    }
  }

  return {
    submissionId,
    available: registryCourses.length,
    added,
    linked,
  };
}

// Backwards-compatible name used by existing routes. The broader function now
// includes programme-linked CCMAS/Registry courses as well as university-wide GST.
export const preloadGstCoursesForSubmission = preloadRegistryCoursesForSubmission;
