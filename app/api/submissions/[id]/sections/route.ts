import { NextResponse } from "next/server";
import { canViewSubmission, requireApiUser } from "@/lib/api-auth";
import { getSectionMarks } from "@/lib/submissions/section-status";
import { NO_ACCESS, couldNot } from "@/lib/messages";

/**
 * GET /api/submissions/[id]/sections: the tick, amber dot or red number for
 * each section of the draft (task G4), and its overall progress (G5).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    return NextResponse.json(await getSectionMarks(id));
  } catch (error) {
    console.error("Failed to work out the section marks:", error);
    return NextResponse.json({ error: couldNot("load the section status") }, { status: 500 });
  }
}
