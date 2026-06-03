import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/master-courses/[id]/programmes - Get all programmes linked to this course
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const course = await prisma.masterCourse.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        title: true,
        programmeLinks: {
          include: {
            programme: {
              select: {
                id: true,
                name: true,
                code: true,
                department: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    school: {
                      select: {
                        id: true,
                        name: true,
                        code: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    return NextResponse.json(course);
  } catch (error) {
    console.error("Failed to fetch programme links:", error);
    return NextResponse.json(
      { error: "Failed to fetch programme links" },
      { status: 500 },
    );
  }
}

// POST /api/master-courses/[id]/programmes - Link course to multiple programmes at once
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { programmeIds, isCore = true } = body;

    if (
      !programmeIds ||
      !Array.isArray(programmeIds) ||
      programmeIds.length === 0
    ) {
      return NextResponse.json(
        { error: "programmeIds array is required" },
        { status: 400 },
      );
    }

    // Verify the course exists
    const course = await prisma.masterCourse.findUnique({
      where: { id },
    });
    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Verify all programmes exist
    const programmes = await prisma.programme.findMany({
      where: { id: { in: programmeIds } },
      select: { id: true },
    });
    if (programmes.length !== programmeIds.length) {
      return NextResponse.json(
        { error: "One or more programmes not found" },
        { status: 400 },
      );
    }

    // Create links (skip existing ones)
    const existingLinks = await prisma.programmeCourse.findMany({
      where: {
        courseId: id,
        programmeId: { in: programmeIds },
      },
      select: { programmeId: true },
    });
    const existingProgrammeIds = new Set(
      existingLinks.map((l) => l.programmeId),
    );
    const newProgrammeIds = programmeIds.filter(
      (pid: string) => !existingProgrammeIds.has(pid),
    );

    if (newProgrammeIds.length > 0) {
      await prisma.programmeCourse.createMany({
        data: newProgrammeIds.map((programmeId: string) => ({
          programmeId,
          courseId: id,
          isCore: Boolean(isCore),
        })),
      });
    }

    // Return updated course with all links
    const updatedCourse = await prisma.masterCourse.findUnique({
      where: { id },
      include: {
        programmeLinks: {
          include: {
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

    return NextResponse.json({
      message: `Linked course to ${newProgrammeIds.length} new programme(s). ${existingLinks.length} already existed.`,
      course: updatedCourse,
    });
  } catch (error) {
    console.error("Failed to link programmes:", error);
    return NextResponse.json(
      { error: "Failed to link programmes" },
      { status: 500 },
    );
  }
}

// DELETE /api/master-courses/[id]/programmes - Unlink programmes from course
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const programmeId = searchParams.get("programmeId");

    if (!programmeId) {
      return NextResponse.json(
        { error: "programmeId query parameter is required" },
        { status: 400 },
      );
    }

    const deleted = await prisma.programmeCourse.deleteMany({
      where: {
        courseId: id,
        programmeId: programmeId,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Programme unlinked successfully" });
  } catch (error) {
    console.error("Failed to unlink programme:", error);
    return NextResponse.json(
      { error: "Failed to unlink programme" },
      { status: 500 },
    );
  }
}
