import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { GRACE_VISION_SPACE_URL, parseGraceAnalysis } from "@/lib/grace-vision";
import {
  canViewSubmission,
  getApiUser,
  requireApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";

const GRACE_API_URL = `${GRACE_VISION_SPACE_URL}/check-grace`;

// POST /api/grace-check - Start a GRACE compliance check
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, submissionId, courseId, title, content } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: "title and content are required" },
        { status: 400 },
      );
    }

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

    // Call external GRACE API
    let graceResult;
    try {
      const res = await fetch(GRACE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        graceResult = {
          scores: {},
          pillarSummaries: {},
          explanation: "Compliance check failed. Please try again.",
          recommendation: "",
          passed: false,
        };
      } else {
        const data = (await res.json()) as {
          analysis?: unknown;
          model_used?: string;
        };
        const analysisData = data.analysis ?? data;
        const modelUsed =
          typeof data.model_used === "string" ? data.model_used : undefined;
        graceResult = analysisData
          ? parseGraceAnalysis(analysisData, modelUsed)
          : {
              scores: {},
              pillarSummaries: {},
              explanation: "No analysis returned from server.",
              recommendation: "",
              passed: false,
            };
      }
    } catch {
      graceResult = {
        scores: {},
        pillarSummaries: {},
        explanation:
          "Could not reach the GRACE compliance server. Please try again later.",
        recommendation: "",
        passed: false,
      };
    }

    // Persist result based on type
    if (type === "philosophy" && submissionId) {
      await prisma.submissionContent.update({
        where: { submissionId },
        data: {
          philosophyGracePass: graceResult.passed,
          philosophyGrace: graceResult,
        },
      });
    } else if (type === "course" && courseId) {
      await prisma.courseDescription.upsert({
        where: { courseId },
        update: {
          gracePass: graceResult.passed,
          graceResult: graceResult,
        },
        create: {
          courseId,
          submissionId: targetSubmissionId,
          gracePass: graceResult.passed,
          graceResult: graceResult,
        },
      });
    }

    return NextResponse.json(graceResult);
  } catch (error) {
    console.error("GRACE check failed:", error);
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
        select: { gracePass: true, graceResult: true },
      });
      return NextResponse.json({
        passed: desc?.gracePass ?? false,
        result: desc?.graceResult ?? null,
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
