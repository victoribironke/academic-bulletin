import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  formatCourseTitle,
  formatCourseCode,
  isValidCourseCode,
} from "@/lib/validation/name-format";
import {
  canReadSubmission,
  getApiUser,
  requireApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import { AUTOSAVE_COALESCE_MINUTES, recordActivity } from "@/lib/activity-log";
import { synchronizeCourseGraceAssessment } from "@/lib/courses/grace-compliance";

// GET /api/courses/[id] - Get single course with description
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        description: true,
        masterCourse: {
          select: {
            id: true,
            code: true,
            title: true,
            type: true,
            ownership: true,
          },
        },
        submission: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canReadSubmission(auth.user, course.submission.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(course);
  } catch (error) {
    console.error("Failed to fetch course:", error);
    return NextResponse.json(
      { error: "Failed to fetch course" },
      { status: 500 },
    );
  }
}

// PATCH /api/courses/[id] - Update course
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
      status,
      semester,
      level,
      prerequisites,
      masterCourseId,
    } = body;

    // Check if course exists
    const existing = await prisma.course.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(
      user,
      existing.submissionId,
    );
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message },
        { status: gate.status },
      );
    }

    // Validate course code if provided
    if (code !== undefined && !isValidCourseCode(code)) {
      return NextResponse.json(
        {
          error:
            "Invalid course code format. Expected format: AAA 123 (e.g., COS 101)",
        },
        { status: 400 },
      );
    }

    // Build update data with formatting
    const updateData: Record<string, unknown> = {};
    if (code !== undefined) updateData.code = formatCourseCode(code);
    if (title !== undefined) updateData.title = formatCourseTitle(title);
    if (units !== undefined) updateData.units = units;
    if (status !== undefined) updateData.status = status;
    if (semester !== undefined) {
      if (![1, 2].includes(semester)) {
        return NextResponse.json(
          { error: "Invalid semester. Must be 1 or 2" },
          { status: 400 },
        );
      }
      updateData.semester = semester;
    }
    if (level !== undefined) updateData.level = level;
    if (prerequisites !== undefined)
      updateData.prerequisites = prerequisites || null;
    if (masterCourseId !== undefined)
      updateData.masterCourseId = masterCourseId || null;

    const course = await prisma.course.update({
      where: { id },
      data: updateData,
      include: {
        description: true,
        masterCourse: {
          select: {
            id: true,
            code: true,
            title: true,
          },
        },
      },
    });

    if (title !== undefined && course.description) {
      await synchronizeCourseGraceAssessment(course.id);
    }

    await recordActivity({
      actorId: user!.id,
      action: "COURSE_UPDATED",
      entityType: "SUBMISSION",
      entityId: existing.submissionId,
      description: `Updated ${course.code} - ${course.title}.`,
      metadata: { courseId: id, fields: Object.keys(updateData) },
      // Autosave fires every few seconds; log one entry per editing session.
      coalesceWithinMinutes: AUTOSAVE_COALESCE_MINUTES,
    });

    return NextResponse.json(course);
  } catch (error) {
    console.error("Failed to update course:", error);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 },
    );
  }
}

// DELETE /api/courses/[id] - Delete course
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Check if course exists
    const existing = await prisma.course.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(
      user,
      existing.submissionId,
    );
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message },
        { status: gate.status },
      );
    }

    // Delete course (cascades to description)
    await prisma.$transaction(async (tx) => {
      await recordActivity(
        {
          actorId: user!.id,
          action: "COURSE_DELETED",
          entityType: "SUBMISSION",
          entityId: existing.submissionId,
          description: `Deleted ${existing.code} - ${existing.title}.`,
          metadata: { courseId: id },
        },
        tx,
      );
      await tx.course.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete course:", error);
    return NextResponse.json(
      { error: "Failed to delete course" },
      { status: 500 },
    );
  }
}
