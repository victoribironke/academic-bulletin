import { NextResponse } from "next/server";
import { getApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { processPendingGraceAssessments } from "@/lib/courses/grace-compliance";
import { aiRateLimitResponse } from "@/lib/rate-limit";
import { couldNot } from "@/lib/messages";

export const maxDuration = 60;

/** Checks run per call; the page calls again while queued checks remain. */
const BATCH_SIZE = 3;

/**
 * Runs a small batch of a bulletin's queued GRACE checks. Each check costs
 * money, so only people who can edit the bulletin may run them, at a limited
 * rate. Reading progress is GET /api/grace-check/progress, which runs nothing.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const submissionId = String(body?.submissionId || "");
    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 },
      );
    }

    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(user, submissionId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.message }, { status: gate.status });
    }

    const limited = await aiRateLimitResponse("graceQueue", user!.id);
    if (limited) return limited;

    const result = await processPendingGraceAssessments({
      submissionId,
      limit: BATCH_SIZE,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to process queued GRACE checks:", error);
    return NextResponse.json(
      { error: couldNot("process queued GRACE checks") },
      { status: 500 },
    );
  }
}
