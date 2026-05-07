import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";

// GET /api/courses/[id]/description - Get course description
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const description = await prisma.courseDescription.findUnique({
      where: { courseId: id },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            units: true,
          },
        },
      },
    });

    if (!description) {
      return NextResponse.json(
        { error: "Course description not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(description);
  } catch (error) {
    console.error("Failed to fetch course description:", error);
    return NextResponse.json(
      { error: "Failed to fetch course description" },
      { status: 500 },
    );
  }
}

// PUT /api/courses/[id]/description - Create or update course description
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      learningOutcomes,
      courseContent,
      labWork,
      entrepreneurialAspect,
      gracePass,
      graceResult,
    } = body;

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id },
      select: { id: true, submissionId: true },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(user, course.submissionId);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message },
        { status: gate.status },
      );
    }

    const data = {
      learningOutcomes: learningOutcomes || null,
      courseContent: courseContent || null,
      labWork: labWork || null,
      entrepreneurialAspect: entrepreneurialAspect || null,
      ...(gracePass !== undefined && { gracePass }),
      ...(graceResult !== undefined && { graceResult }),
    };

    // Upsert description
    const description = await prisma.courseDescription.upsert({
      where: { courseId: id },
      update: data,
      create: {
        courseId: id,
        submissionId: course.submissionId,
        ...data,
      },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            title: true,
          },
        },
      },
    });

    return NextResponse.json(description);
  } catch (error) {
    console.error("Failed to update course description:", error);
    return NextResponse.json(
      { error: "Failed to update course description" },
      { status: 500 },
    );
  }
}
