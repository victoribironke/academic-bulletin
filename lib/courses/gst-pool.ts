import prisma from "@/lib/prisma";

const EDITABLE_SUBMISSION_STATUSES = ["DRAFT", "CORRECTIONS_REQUIRED"] as const;

export type GstPreloadResult = {
  submissionId: string;
  available: number;
  added: number;
  linked: number;
};

/**
 * Makes every discoverable university-wide GST course available in one
 * programme submission. Existing local edits are preserved; missing courses
 * receive the Registry values as their starting point.
 */
export async function preloadGstCoursesForSubmission(
  submissionId: string,
): Promise<GstPreloadResult> {
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

  const gstCourses = await prisma.masterCourse.findMany({
    where: {
      ownership: "INSTITUTIONAL",
      type: { in: ["GST_NUC", "GST_BU"] },
      discoverable: true,
    },
    include: {
      prerequisites: { select: { code: true } },
    },
    orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
  });

  if (gstCourses.length === 0) {
    return { submissionId, available: 0, added: 0, linked: 0 };
  }

  await prisma.programmeCourse.createMany({
    data: gstCourses.map((course) => ({
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

  for (const master of gstCourses) {
    const wasPresent = existingCodes.has(master.code);
    const course = await prisma.course.upsert({
      where: {
        code_submissionId: { code: master.code, submissionId },
      },
      create: {
        submissionId,
        masterCourseId: master.id,
        code: master.code,
        title: master.title,
        units: master.units,
        status: "CORE",
        semester: master.semester,
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
    const learningOutcomes = Array.isArray(master.learningOutcomes)
      ? master.learningOutcomes.filter(
          (item): item is string => typeof item === "string" && item.trim() !== "",
        )
      : [];
    const courseContent =
      master.courseContent?.trim() || master.description?.trim() || "";
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
        await prisma.courseDescription.create({
          data: {
            courseId: course.id,
            submissionId,
            courseContent: courseContent || null,
            learningOutcomes,
            labWork: master.labWork?.trim() || null,
            entrepreneurialAspect:
              master.entrepreneurialAspect?.trim() || null,
          },
        });
      }
    }
  }

  return {
    submissionId,
    available: gstCourses.length,
    added,
    linked,
  };
}
