import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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
    const { learningOutcomes, courseContent, labWork, entrepreneurialAspect } =
      body;

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id },
      select: { id: true, submissionId: true },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    // Upsert description
    const description = await prisma.courseDescription.upsert({
      where: { courseId: id },
      update: {
        learningOutcomes: learningOutcomes || null,
        courseContent: courseContent || null,
        labWork: labWork || null,
        entrepreneurialAspect: entrepreneurialAspect || null,
      },
      create: {
        courseId: id,
        submissionId: course.submissionId,
        learningOutcomes: learningOutcomes || null,
        courseContent: courseContent || null,
        labWork: labWork || null,
        entrepreneurialAspect: entrepreneurialAspect || null,
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
