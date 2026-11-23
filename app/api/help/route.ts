import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { dapOfficerFor } from "@/lib/people/officers";
import { formatOpeningDate } from "@/lib/submissions/submission-window";

/**
 * GET /api/help: what the quick start (task H1) needs beyond the steps: the
 * DAP officer for the person's school (name, email, WhatsApp), the general
 * help contact, and when "Submit to School" opens in the current cycle.
 */
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const [officer, cycle] = await Promise.all([
      dapOfficerFor(auth.user.schoolId),
      prisma.reviewCycle.findFirst({
        where: { isActive: true, archivedAt: null },
        select: { name: true, submissionsOpenAt: true },
        orderBy: { startedAt: "desc" },
      }),
    ]);
    return NextResponse.json({
      officer,
      generalHelp: process.env.INVITATION_HELP_CONTACT?.trim() || null,
      cycle: cycle?.name ?? null,
      submitOpens:
        cycle?.submissionsOpenAt && cycle.submissionsOpenAt > new Date()
          ? formatOpeningDate(cycle.submissionsOpenAt)
          : null,
    });
  } catch (error) {
    console.error("Failed to load help details:", error);
    return NextResponse.json({ error: "Failed to load help details" }, { status: 500 });
  }
}
