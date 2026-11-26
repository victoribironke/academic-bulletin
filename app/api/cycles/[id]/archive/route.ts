import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  ARCHIVE_CYCLE_WORD,
  archiveConfirmationMatches,
  archiveCycle,
  cycleArchiveSummary,
} from "@/lib/cycles/archive";
import prisma from "@/lib/prisma";
import { couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

/** GET: what would move to the Archive with this cycle (task A2). */
export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const cycle = await prisma.reviewCycle.findUnique({ where: { id }, select: { id: true } });
  if (!cycle) return NextResponse.json({ error: "Review cycle not found." }, { status: 404 });
  return NextResponse.json(await cycleArchiveSummary(id));
}

/**
 * POST { confirm: "ARCHIVE", isTest?: boolean }: closes the cycle and moves
 * it, with its drafts, comments, photos and log entries, to the Archive.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { confirm?: unknown; isTest?: unknown };
    if (!archiveConfirmationMatches(body.confirm)) {
      return NextResponse.json(
        {
          error: `Type ${ARCHIVE_CYCLE_WORD} to confirm.`,
          code: "CONFIRMATION_REQUIRED",
          confirmWord: ARCHIVE_CYCLE_WORD,
        },
        { status: 400 },
      );
    }
    const result = await archiveCycle({ cycleId: id, actorId: auth.user.id, isTest: body.isTest === true });
    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ archived: true, summary: result.summary });
  } catch (error) {
    console.error("Failed to archive review cycle:", error);
    return NextResponse.json({ error: couldNot("archive the review cycle") }, { status: 500 });
  }
}
