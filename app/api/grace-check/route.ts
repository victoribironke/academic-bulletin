import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { GraceServiceError, runGraceCheck } from "@/lib/grace";
import {
  processGraceAssessment,
  synchronizeCourseGraceAssessment,
} from "@/lib/courses/grace-compliance";
import {
  canViewSubmission,
  getApiUser,
  requireApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import { philosophyGraceHash } from "@/lib/submissions/submit-readiness";

// GRACE model calls can take a while; allow up to a minute.
export const maxDuration = 60;

// POST /api/grace-check - Start a GRACE compliance check
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, submissionId, courseId, title, content } = body;

    let targetSubmissionId = submissionId as string | undefined;
    if (type === "course" && courseId) {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { submissionId: true },
      });
      targetSubmissionId = course?.submissionId;
    }
    if (!targetSubmissionId) {
      return NextResponse.json(
        { error: "A valid submission or course is required." },
        { status: 400 },
      );
    }

    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(user, targetSubmissionId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    if (type === "philosophy" && submissionId) {
      if (!title || !content) {
        return NextResponse.json(
          { error: "title and content are required" },
          { status: 400 },
        );
      }
      const graceResult = await runGraceCheck(title, content);
      await prisma.submissionContent.update({
        where: { submissionId },
        data: {
          philosophyGracePass: graceResult.passed,
          // The fingerprint ties this pass to the exact text that was checked;
          // Submit ignores it once the saved philosophy no longer matches.
          philosophyGrace: { ...graceResult, contentHash: philosophyGraceHash(content) },
        },
      });
      return NextResponse.json(graceResult);
    }

    if (type === "course" && courseId) {
      await synchronizeCourseGraceAssessment(courseId);
      const description = await prisma.courseDescription.findUnique({
        where: { courseId },
        select: {
          courseContent: true,
          graceContentHash: true,
          graceStatus: true,
        },
      });
      if (!description?.courseContent?.trim() || !description.graceContentHash) {
        return NextResponse.json(
          { error: "Save the course description before running GRACE." },
          { status: 400 },
        );
      }

      const assessment = await processGraceAssessment(
        description.graceContentHash,
        { retry: description.graceStatus === "ERROR" },
      );
      if (assessment?.status === "ERROR") {
        return NextResponse.json(
          {
            error:
              assessment.error ||
              "The GRACE compliance service is temporarily unavailable.",
            code: "GRACE_SERVICE_UNAVAILABLE",
          },
          { status: 503 },
        );
      }
      if (assessment?.result) {
        return NextResponse.json(assessment.result);
      }
      return NextResponse.json(
        { error: "The GRACE check is already being processed." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Unknown GRACE check type." }, { status: 400 });
  } catch (error) {
    console.error("GRACE check failed:", error);
    if (error instanceof GraceServiceError) {
      return NextResponse.json(
        { error: error.message, code: "GRACE_SERVICE_UNAVAILABLE" },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: "GRACE check failed" }, { status: 500 });
  }
}

// GET /api/grace-check?submissionId=X or ?courseId=X - Poll for result
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get("submissionId");
  const courseId = searchParams.get("courseId");

  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    if (submissionId) {
      if (!(await canViewSubmission(auth.user, submissionId))) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const content = await prisma.submissionContent.findUnique({
        where: { submissionId },
        select: { philosophyGracePass: true, philosophyGrace: true },
      });
      return NextResponse.json({
        passed: content?.philosophyGracePass ?? false,
        result: content?.philosophyGrace ?? null,
      });
    }

    if (courseId) {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { submissionId: true },
      });
      if (
        !course ||
        !(await canViewSubmission(auth.user, course.submissionId))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const desc = await prisma.courseDescription.findUnique({
        where: { courseId },
        select: {
          gracePass: true,
          graceResult: true,
          graceStatus: true,
          graceCheckedAt: true,
          graceAssessment: { select: { error: true } },
        },
      });
      return NextResponse.json({
        passed: desc?.gracePass ?? false,
        result: desc?.graceResult ?? null,
        status: desc?.graceStatus ?? "PENDING",
        checkedAt: desc?.graceCheckedAt ?? null,
        error: desc?.graceAssessment?.error ?? null,
      });
    }

    return NextResponse.json(
      { error: "submissionId or courseId required" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Failed to fetch GRACE result:", error);
    return NextResponse.json(
      { error: "Failed to fetch GRACE result" },
      { status: 500 },
    );
  }
}
