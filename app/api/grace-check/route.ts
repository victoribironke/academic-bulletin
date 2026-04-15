import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const GRACE_API_URL = "https://santacl-grace.hf.space/check-grace";

function parseGraceAnalysis(analysis: unknown) {
  let scores: Record<string, number> = {};
  let explanation = "";
  let recommendation = "";

  let parsed = analysis;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      const jsonMatch = (parsed as string).match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[1]); } catch { /* keep as string */ }
      }
    }
  }

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.GRACE_PILLARS)) {
      obj.GRACE_PILLARS.forEach((p: { pillar?: string; score?: number }) => {
        if (p?.pillar && typeof p.score === "number") {
          scores[p.pillar] = p.score;
        }
      });
    } else if (typeof obj.GRACE_PILLARS === "object" && obj.GRACE_PILLARS) {
      scores = obj.GRACE_PILLARS as Record<string, number>;
    }
    explanation = (obj.Vision_Alignment || obj.Explanation || "") as string;
    recommendation = (obj.Recommendation || "") as string;
  }

  const scoreValues = Object.values(scores);
  const passed = scoreValues.length > 0 && scoreValues.every((s) => s >= 3);

  return { scores, explanation, recommendation, passed };
}

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
          explanation: "Compliance check failed. Please try again.",
          recommendation: "",
          passed: false,
        };
      } else {
        const data = await res.json();
        const analysisData = data.analysis || data;
        graceResult = analysisData
          ? parseGraceAnalysis(analysisData)
          : {
              scores: {},
              explanation: "No analysis returned from server.",
              recommendation: "",
              passed: false,
            };
      }
    } catch {
      graceResult = {
        scores: {},
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
      await prisma.courseDescription.update({
        where: { courseId },
        data: {
          gracePass: graceResult.passed,
          graceResult: graceResult,
        },
      });
    }

    return NextResponse.json(graceResult);
  } catch (error) {
    console.error("GRACE check failed:", error);
    return NextResponse.json(
      { error: "GRACE check failed" },
      { status: 500 },
    );
  }
}

// GET /api/grace-check?submissionId=X or ?courseId=X - Poll for result
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get("submissionId");
  const courseId = searchParams.get("courseId");

  try {
    if (submissionId) {
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
      const desc = await prisma.courseDescription.findUnique({
        where: { courseId },
        select: { gracePass: true, graceResult: true },
      });
      return NextResponse.json({
        passed: desc?.gracePass ?? false,
        result: desc?.graceResult ?? null,
      });
    }

    return NextResponse.json({ error: "submissionId or courseId required" }, { status: 400 });
  } catch (error) {
    console.error("Failed to fetch GRACE result:", error);
    return NextResponse.json({ error: "Failed to fetch GRACE result" }, { status: 500 });
  }
}
