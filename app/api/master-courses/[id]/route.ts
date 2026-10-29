import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  formatCourseTitle,
  isValidCourseCode,
  formatCourseCode,
} from "@/lib/validation/name-format";
import { requireApiUser } from "@/lib/api-auth";
import { propagateMasterCourseChanges } from "@/lib/courses/propagation";

// Valid enum values
const VALID_COURSE_TYPES = [
  "GENERAL",
  "CORE",
  "ELECTIVE",
  "REQUIRED",
  "GST_NUC",
  "GST_BU",
];
const VALID_OWNERSHIP = ["DEPARTMENT", "SCHOOL", "INSTITUTIONAL"];
const VALID_LEVELS = [100, 200, 300, 400, 500];
const VALID_SEMESTERS = [1, 2];

// GET /api/master-courses/[id] - Get a single master course
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const course = await prisma.masterCourse.findUnique({
      where: { id },
      include: {
        ownerDepartment: {
          select: { id: true, name: true, code: true },
        },
        ownerSchool: {
          select: { id: true, name: true, code: true },
        },
        programmeLinks: {
          include: {
            programme: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        prerequisites: {
          select: { id: true, code: true, title: true },
        },
        _count: {
          select: { programmeLinks: true, submissionCourses: true },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    return NextResponse.json(course);
  } catch (error) {
    console.error("Failed to fetch master course:", error);
    return NextResponse.json(
      { error: "Failed to fetch course" },
      { status: 500 },
    );
  }
}

// PATCH /api/master-courses/[id] - Update master course and propagate changes
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser(["HOD", "ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const {
      code,
      title,
      units,
      type,
      ownership,
      level,
      semester,
      description,
      learningOutcomes,
      courseContent,
      labWork,
      entrepreneurialAspect,
      ownerDeptId,
      discoverable,
      prerequisiteIds,
    } = body;

    // Check if course exists
    const existing = await prisma.masterCourse.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const isAdministrator = ["ADMIN", "SUPER_ADMIN"].includes(auth.user.role);
    const isHostingHod =
      auth.user.role === "HOD" &&
      Boolean(auth.user.departmentId) &&
      existing.ownerDeptId === auth.user.departmentId &&
      existing.ownership === "INSTITUTIONAL" &&
      ["GST_NUC", "GST_BU"].includes(existing.type);
    if (!isAdministrator && !isHostingHod) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      isHostingHod &&
      [code, type, ownership, ownerDeptId, discoverable, prerequisiteIds].some(
        (value) => value !== undefined,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Hosting HoDs may edit GST teaching details, but Registry ownership and availability are managed by Academic Planning.",
        },
        { status: 403 },
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (code !== undefined) {
      if (!isValidCourseCode(code)) {
        return NextResponse.json(
          { error: "Invalid course code format" },
          { status: 400 },
        );
      }
      updateData.code = formatCourseCode(code);
    }
    if (title !== undefined) updateData.title = formatCourseTitle(title);
    if (units !== undefined) {
      if (typeof units !== "number" || units < 1 || units > 6) {
        return NextResponse.json(
          { error: "Units must be between 1 and 6" },
          { status: 400 },
        );
      }
      updateData.units = units;
    }
    if (type !== undefined) {
      if (!VALID_COURSE_TYPES.includes(type)) {
        return NextResponse.json(
          { error: "Invalid course type" },
          { status: 400 },
        );
      }
      updateData.type = type;
    }
    if (ownership !== undefined) {
      if (!VALID_OWNERSHIP.includes(ownership)) {
        return NextResponse.json(
          { error: "Invalid ownership" },
          { status: 400 },
        );
      }
      updateData.ownership = ownership;
    }
    if (level !== undefined) {
      if (!VALID_LEVELS.includes(level)) {
        return NextResponse.json({ error: "Invalid level" }, { status: 400 });
      }
      updateData.level = level;
    }
    if (semester !== undefined) {
      if (!VALID_SEMESTERS.includes(semester)) {
        return NextResponse.json(
          { error: "Invalid semester" },
          { status: 400 },
        );
      }
      updateData.semester = semester;
    }
    if (description !== undefined) updateData.description = description || null;
    if (learningOutcomes !== undefined) {
      if (!Array.isArray(learningOutcomes)) {
        return NextResponse.json(
          { error: "Learning outcomes must be a list." },
          { status: 400 },
        );
      }
      updateData.learningOutcomes = learningOutcomes
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (courseContent !== undefined)
      updateData.courseContent = courseContent || null;
    if (labWork !== undefined) updateData.labWork = labWork || null;
    if (entrepreneurialAspect !== undefined) {
      updateData.entrepreneurialAspect = entrepreneurialAspect || null;
    }
    if (ownerDeptId !== undefined) {
      if (ownerDeptId) {
        const department = await prisma.department.findUnique({
          where: { id: ownerDeptId },
          select: { id: true },
        });
        if (!department) {
          return NextResponse.json(
            { error: "Hosting department not found." },
            { status: 400 },
          );
        }
      }
      updateData.ownerDeptId = ownerDeptId || null;
    }
    if (discoverable !== undefined)
      updateData.discoverable = Boolean(discoverable);

    // Handle prerequisite updates
    let prerequisiteConnect = undefined;
    if (prerequisiteIds !== undefined && Array.isArray(prerequisiteIds)) {
      prerequisiteConnect = {
        set: prerequisiteIds.map((pid: string) => ({ id: pid })),
      };
    }

    // Update the master course
    const course = await prisma.masterCourse.update({
      where: { id },
      data: {
        ...updateData,
        ...(prerequisiteConnect && { prerequisites: prerequisiteConnect }),
      },
      include: {
        ownerDepartment: { select: { id: true, name: true, code: true } },
        ownerSchool: { select: { id: true, name: true, code: true } },
        prerequisites: { select: { id: true, code: true, title: true } },
      },
    });

    // Propagate changes to linked submission courses
    const propagationResult = await propagateMasterCourseChanges({
      id,
      title: title !== undefined ? formatCourseTitle(title) : undefined,
      units,
      level,
      semester,
      learningOutcomes:
        learningOutcomes !== undefined
          ? learningOutcomes
              .filter((item: unknown): item is string => typeof item === "string")
              .map((item: string) => item.trim())
              .filter(Boolean)
          : undefined,
      courseContent:
        courseContent !== undefined ? courseContent || null : undefined,
      labWork: labWork !== undefined ? labWork || null : undefined,
      entrepreneurialAspect:
        entrepreneurialAspect !== undefined
          ? entrepreneurialAspect || null
          : undefined,
    });

    return NextResponse.json({
      course,
      propagation: propagationResult,
    });
  } catch (error) {
    console.error("Failed to update master course:", error);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 },
    );
  }
}

// DELETE /api/master-courses/[id] - Delete master course
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    // Check if course exists and has dependencies
    const existing = await prisma.masterCourse.findUnique({
      where: { id },
      include: {
        _count: { select: { programmeLinks: true, submissionCourses: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Prevent deletion if has linked programmes or submissions
    if (
      existing._count.programmeLinks > 0 ||
      existing._count.submissionCourses > 0
    ) {
      return NextResponse.json(
        {
          error:
            "Cannot delete course with linked programmes or submissions. Remove links first.",
        },
        { status: 400 },
      );
    }

    await prisma.masterCourse.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete master course:", error);
    return NextResponse.json(
      { error: "Failed to delete course" },
      { status: 500 },
    );
  }
}
