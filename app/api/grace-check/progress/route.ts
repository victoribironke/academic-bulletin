import { NextRequest, NextResponse } from "next/server";
import { canReadSubmission, requireApiUser } from "@/lib/api-auth";
import { getSubmissionGraceProgress } from "@/lib/courses/grace-compliance";
import { NO_ACCESS, couldNot } from "@/lib/messages";

/**
 * GET /api/grace-check/progress?submissionId=X
 *
 * How far a bulletin's course checks have got. Reads only: it never queues or
 * runs a check, so opening a page that polls it costs nothing.
 */
export async function GET(request: NextRequest) {
  try {
    const submissionId = request.nextUrl.searchParams.get("submissionId");
    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 },
      );
    }

    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canReadSubmission(auth.user, submissionId))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }

    return NextResponse.json({
      progress: await getSubmissionGraceProgress(submissionId),
    });
  } catch (error) {
    console.error("Failed to read GRACE progress:", error);
    return NextResponse.json(
      { error: couldNot("read GRACE progress") },
      { status: 500 },
    );
  }
}
