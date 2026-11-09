import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canReadSubmission,
  getApiUser,
  requireApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import { AUTOSAVE_COALESCE_MINUTES, recordActivity } from "@/lib/activity-log";
import {
  normalizeLearningOutcomes,
  prepareCourseGraceState,
} from "@/lib/courses/grace-compliance";

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
            submissionId: true,
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

    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canReadSubmission(auth.user, description.course.submissionId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
      select: { id: true, title: true, submissionId: true },
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

    const outcomes = normalizeLearningOutcomes(learningOutcomes);
    const content = typeof courseContent === "string" ? courseContent.trim() : "";
    const description = await prisma.$transaction(async (tx) => {
      const graceState = await prepareCourseGraceState(tx, {
        title: course.title,
        learningOutcomes: outcomes,
        courseContent: content,
      });
      const saved = await tx.courseDescription.upsert({
        where: { courseId: id },
        update: {
          learningOutcomes: outcomes,
          courseContent: content || null,
          labWork: typeof labWork === "string" ? labWork.trim() || null : null,
          entrepreneurialAspect:
            typeof entrepreneurialAspect === "string"
              ? entrepreneurialAspect.trim() || null
              : null,
          ...graceState,
        },
        create: {
          courseId: id,
          submissionId: course.submissionId,
          learningOutcomes: outcomes,
          courseContent: content || null,
          labWork: typeof labWork === "string" ? labWork.trim() || null : null,
          entrepreneurialAspect:
            typeof entrepreneurialAspect === "string"
              ? entrepreneurialAspect.trim() || null
              : null,
          ...graceState,
        },
        include: {
          course: {
            select: { id: true, code: true, title: true },
          },
        },
      });
      await recordActivity(
        {
          actorId: user!.id,
          action: "COURSE_DETAILS_UPDATED",
          entityType: "SUBMISSION",
          entityId: course.submissionId,
          description: `Updated the learning outcomes and course content for ${saved.course.code}.`,
          metadata: { courseId: id, graceStatus: saved.graceStatus },
          coalesceWithinMinutes: AUTOSAVE_COALESCE_MINUTES,
        },
        tx,
      );
      return saved;
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
