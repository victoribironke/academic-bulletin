import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canViewSubmission, requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { baselineFor, baselineTexts, summaryOfChanges } from "@/lib/bulletin/baseline";
import { carriedField } from "@/lib/bulletin/carried-fields";
import { NO_ACCESS, couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Tasks E2 and E3. GET: the programme's 2023-2027 text for each carried
 * field and which fields are still carried (not reviewed); with
 * ?summary=1, a first draft of the Summary of Changes from the differences.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    const draft = await prisma.submission.findUnique({
      where: { id },
      select: {
        programme: { select: { code: true } },
        content: true,
      },
    });
    if (!draft) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const baseline = baselineFor(draft.programme.code);
    if (!baseline) return NextResponse.json({ hasBaseline: false, carried: [], texts: {} });

    if (new URL(request.url).searchParams.get("summary") === "1") {
      const courses = await prisma.course.findMany({
        where: { submissionId: id },
        select: { code: true, title: true, units: true, level: true, semester: true, status: true },
      });
      return NextResponse.json({ html: summaryOfChanges(baseline, draft.content as Record<string, unknown> | null, courses) });
    }

    return NextResponse.json({
      hasBaseline: true,
      file: baseline.file,
      carried: draft.content?.carriedFields ?? [],
      texts: baselineTexts(baseline),
    });
  } catch (error) {
    console.error("Failed to read the 2023-2027 text:", error);
    return NextResponse.json({ error: couldNot("load the 2023-2027 text") }, { status: 500 });
  }
}

/** POST { reviewed: ["vision", ...] }: the Head has read these and keeps them. */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const body = (await request.json().catch(() => ({}))) as { reviewed?: unknown };
    const reviewed = Array.isArray(body.reviewed) ? body.reviewed.filter((key): key is string => typeof key === "string" && Boolean(carriedField(key))) : [];
    if (reviewed.length === 0) return NextResponse.json({ error: "Say which field you reviewed." }, { status: 400 });

    const content = await prisma.submissionContent.findUnique({ where: { submissionId: id }, select: { carriedFields: true } });
    const carried = content?.carriedFields ?? [];
    const remaining = carried.filter((key) => !reviewed.includes(key));
    if (remaining.length !== carried.length) {
      await prisma.submissionContent.update({ where: { submissionId: id }, data: { carriedFields: remaining } });
      await recordActivity({
        actorId: auth.user.id,
        action: "CARRIED_TEXT_REVIEWED",
        entityType: "SUBMISSION",
        entityId: id,
        description: `Marked the 2023-2027 text reviewed: ${reviewed.map((key) => carriedField(key)!.label).join(", ")}.`,
        metadata: { fields: reviewed },
      });
    }
    return NextResponse.json({ carried: remaining });
  } catch (error) {
    console.error("Failed to mark the 2023-2027 text reviewed:", error);
    return NextResponse.json({ error: couldNot("mark the text reviewed") }, { status: 500 });
  }
}
