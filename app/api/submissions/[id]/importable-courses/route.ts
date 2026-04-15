import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/submissions/[id]/importable-courses?sourceSubmissionId=X
// Returns courses from a previous bulletin/submission for import
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const sourceSubmissionId = searchParams.get("sourceSubmissionId");

    const submission = await prisma.submission.findUnique({
      where: { id },
      select: { programmeId: true, cycleId: true },
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // If a source submission is specified, return its courses
    if (sourceSubmissionId) {
      const courses = await prisma.course.findMany({
        where: { submissionId: sourceSubmissionId },
        include: {
          description: {
            select: {
              learningOutcomes: true,
              courseContent: true,
              labWork: true,
              entrepreneurialAspect: true,
            },
          },
        },
        orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
      });

      return NextResponse.json(courses);
    }

    // Otherwise return previous submissions for this programme
    const previousSubmissions = await prisma.submission.findMany({
      where: {
        programmeId: submission.programmeId,
        id: { not: id },
        status: { in: ["APPROVED", "DRAFT", "IN_REVIEW"] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        currentPhase: true,
        createdAt: true,
        cycle: { select: { id: true, name: true } },
        _count: { select: { courses: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(previousSubmissions);
  } catch (error) {
    console.error("Failed to fetch importable courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch importable courses" },
      { status: 500 },
    );
  }
}
