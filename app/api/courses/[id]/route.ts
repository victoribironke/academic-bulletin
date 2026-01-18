import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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
        lecturer: {
          select: {
            id: true,
            name: true,
            position: true,
            specialization: true,
          },
        },
        description: true,
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
    const { code, title, units, status, semester, level, lecturerId } = body;

    // Check if course exists
    const existing = await prisma.course.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (code !== undefined) updateData.code = code;
    if (title !== undefined) updateData.title = title;
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
    if (lecturerId !== undefined) updateData.lecturerId = lecturerId || null;

    const course = await prisma.course.update({
      where: { id },
      data: updateData,
      include: {
        lecturer: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
      },
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

    // Delete course (cascades to description)
    await prisma.course.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete course:", error);
    return NextResponse.json(
      { error: "Failed to delete course" },
      { status: 500 },
    );
  }
}
