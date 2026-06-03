/**
 * Course Propagation Logic
 *
 * Handles automatic updates to linked programmes when master courses are modified.
 * Tracks dependencies for borrowed/service courses and manages GDS visibility.
 */

import prisma from "@/lib/prisma";

// Types for propagation
interface PropagationResult {
  success: boolean;
  updatedCount: number;
  affectedProgrammes: string[];
  errors: string[];
}

interface MasterCourseUpdate {
  id: string;
  title?: string;
  units?: number;
  level?: number;
  semester?: number;
  type?: string;
}

/**
 * Propagate changes from a master course to all linked submission courses.
 * When a master course is updated, all courses in submissions that reference
 * this master course should be updated accordingly.
 */
export async function propagateMasterCourseChanges(
  update: MasterCourseUpdate,
): Promise<PropagationResult> {
  const errors: string[] = [];
  const affectedProgrammes: string[] = [];

  try {
    // Find all courses linked to this master course
    const linkedCourses = await prisma.course.findMany({
      where: { masterCourseId: update.id },
      include: {
        submission: {
          select: {
            id: true,
            status: true,
            programme: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    // Build update data from the master course changes
    const updateData: Record<string, unknown> = {};
    if (update.title !== undefined) updateData.title = update.title;
    if (update.units !== undefined) updateData.units = update.units;
    if (update.level !== undefined) updateData.level = update.level;
    if (update.semester !== undefined) updateData.semester = update.semester;

    // Skip if no fields to update
    if (Object.keys(updateData).length === 0) {
      return {
        success: true,
        updatedCount: 0,
        affectedProgrammes: [],
        errors: [],
      };
    }

    // Update only courses in DRAFT status (can't modify submitted/approved)
    const draftCourses = linkedCourses.filter(
      (c) => c.submission?.status === "DRAFT",
    );

    // Track affected programmes
    draftCourses.forEach((c) => {
      const progName = c.submission?.programme?.name;
      if (progName && !affectedProgrammes.includes(progName)) {
        affectedProgrammes.push(progName);
      }
    });

    // Update courses in batch
    const courseIds = draftCourses.map((c) => c.id);

    if (courseIds.length > 0) {
      await prisma.course.updateMany({
        where: { id: { in: courseIds } },
        data: updateData,
      });
    }

    // Log courses that couldn't be updated (non-draft)
    const nonDraftCount = linkedCourses.length - draftCourses.length;
    if (nonDraftCount > 0) {
      errors.push(
        `${nonDraftCount} courses in non-DRAFT submissions were not updated`,
      );
    }

    return {
      success: true,
      updatedCount: courseIds.length,
      affectedProgrammes,
      errors,
    };
  } catch (error) {
    console.error("Course propagation error:", error);
    return {
      success: false,
      updatedCount: 0,
      affectedProgrammes: [],
      errors: [
        `Propagation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
    };
  }
}

/**
 * Get all programmes that use a specific master course.
 */
export async function getProgrammesUsingCourse(
  masterCourseId: string,
): Promise<{ id: string; name: string; code: string; isCore: boolean }[]> {
  const links = await prisma.programmeCourse.findMany({
    where: { courseId: masterCourseId },
    include: {
      programme: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
  });

  return links.map((l) => ({
    id: l.programme.id,
    name: l.programme.name,
    code: l.programme.code,
    isCore: l.isCore,
  }));
}

/**
 * Get all master courses available to a programme based on ownership rules.
 * - DEPARTMENT courses: only from the programme's department
 * - SCHOOL courses: from any department in the same school
 * - INSTITUTIONAL courses: available to all programmes
 */
export async function getAvailableMasterCourses(
  programmeId: string,
): Promise<
  { id: string; code: string; title: string; ownership: string; type: string }[]
> {
  // Get programme's department and school
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    include: {
      department: {
        include: {
          school: true,
        },
      },
    },
  });

  if (!programme) {
    throw new Error("Programme not found");
  }

  const departmentId = programme.departmentId;
  const schoolId = programme.department.schoolId;

  // Find all applicable courses
  const courses = await prisma.masterCourse.findMany({
    where: {
      OR: [
        // Department-owned courses from this department
        { ownership: "DEPARTMENT", ownerDeptId: departmentId },
        // School-owned courses from this school
        { ownership: "SCHOOL", ownerSchoolId: schoolId },
        // Institutional courses (available to all)
        { ownership: "INSTITUTIONAL" },
      ],
    },
    select: {
      id: true,
      code: true,
      title: true,
      ownership: true,
      type: true,
    },
    orderBy: [{ code: "asc" }],
  });

  return courses;
}

/**
 * Check if a course can be borrowed by a programme.
 * Validates ownership rules and prerequisite availability.
 */
export async function canBorrowCourse(
  masterCourseId: string,
  programmeId: string,
): Promise<{ canBorrow: boolean; reason?: string }> {
  const availableCourses = await getAvailableMasterCourses(programmeId);
  const isAvailable = availableCourses.some((c) => c.id === masterCourseId);

  if (!isAvailable) {
    return {
      canBorrow: false,
      reason:
        "Course is not available to this programme based on ownership rules",
    };
  }

  // Check prerequisites
  const masterCourse = await prisma.masterCourse.findUnique({
    where: { id: masterCourseId },
    include: {
      prerequisites: {
        select: { id: true, code: true },
      },
    },
  });

  if (masterCourse?.prerequisites && masterCourse.prerequisites.length > 0) {
    // Check if all prerequisites are linked to the programme
    const programmeCourses = await prisma.programmeCourse.findMany({
      where: { programmeId },
      select: { courseId: true },
    });

    const linkedCourseIds = programmeCourses.map((pc) => pc.courseId);
    const missingPrereqs = masterCourse.prerequisites.filter(
      (p) => !linkedCourseIds.includes(p.id),
    );

    if (missingPrereqs.length > 0) {
      return {
        canBorrow: false,
        reason: `Missing prerequisites: ${missingPrereqs.map((p) => p.code).join(", ")}`,
      };
    }
  }

  return { canBorrow: true };
}

/**
 * Link a master course to a programme, creating the ProgrammeCourse record.
 */
export async function linkCourseToprogramme(
  masterCourseId: string,
  programmeId: string,
  isCore: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { canBorrow, reason } = await canBorrowCourse(
      masterCourseId,
      programmeId,
    );

    if (!canBorrow) {
      return { success: false, error: reason };
    }

    // Check if already linked
    const existing = await prisma.programmeCourse.findFirst({
      where: { courseId: masterCourseId, programmeId },
    });

    if (existing) {
      return {
        success: false,
        error: "Course already linked to this programme",
      };
    }

    await prisma.programmeCourse.create({
      data: {
        courseId: masterCourseId,
        programmeId,
        isCore,
      },
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
