import { NextResponse } from "next/server";
import { canViewSubmission, requireApiUser } from "@/lib/api-auth";
import { loadDraftData } from "@/lib/checks/run";
import { creditSummary, graduationNumbersText } from "@/lib/courses/credit-summary";
import { NO_ACCESS, couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Tasks W4 and W5: the credit summary by level and the graduation numbers,
 * as the app builds them from the saved Course Structure (the same figures
 * the checks, the preview and the bulletin use).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    const data = await loadDraftData(id);
    const summary = creditSummary(data.courses, data.electiveGroups ?? []);
    const stated = typeof data.content?.totalUnits === "number" ? data.content.totalUnits : null;
    return NextResponse.json({
      ...summary,
      statedTotal: stated,
      graduationText: summary.totals.total > 0 ? graduationNumbersText(summary.totals) : null,
    });
  } catch (error) {
    console.error("Failed to build the credit summary:", error);
    return NextResponse.json({ error: couldNot("build the credit summary") }, { status: 500 });
  }
}
