import { NextResponse } from "next/server";
import { canViewSubmission, requireApiUser } from "@/lib/api-auth";
import { processPendingGraceAssessments } from "@/lib/courses/grace-compliance";

export const maxDuration = 60;

/** Processes a small batch; the page repeats this while queued checks remain. */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const submissionId = String(body.submissionId || "");
    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 },
      );
    }
    if (!(await canViewSubmission(auth.user, submissionId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await processPendingGraceAssessments({
      submissionId,
      limit: Number(body.limit) || 3,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to process queued GRACE checks:", error);
    return NextResponse.json(
      { error: "Failed to process queued GRACE checks" },
      { status: 500 },
    );
  }
}
