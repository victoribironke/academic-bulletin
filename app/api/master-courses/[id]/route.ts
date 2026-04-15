import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  formatCourseTitle,
  isValidCourseCode,
  formatCourseCode,
} from "@/lib/validation/name-format";
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
      discoverable,
      prerequisiteIds,
    } = body;

    // Check if course exists
    const existing = await prisma.masterCourse.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
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
