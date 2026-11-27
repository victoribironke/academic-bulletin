import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canViewSubmission, requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { blocking, open, runChecks } from "@/lib/checks/run";
import { NO_ACCESS, couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Tasks F1 and F2. GET: every check on this draft (number, level, section,
 * field, message), with the "Please check" findings already accepted, and
 * whether it is ready (nothing left that must be fixed).
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    const results = await runChecks(id);
    return NextResponse.json({
      ready: blocking(results).length === 0,
      counts: {
        mustFix: blocking(results).length,
        pleaseCheck: results.filter((result) => result.level === "CHECK" && !result.accepted).length,
        accepted: results.filter((result) => result.accepted).length,
      },
      open: open(results).length,
      results,
    });
  } catch (error) {
    console.error("Failed to run the checks:", error);
    return NextResponse.json({ error: couldNot("run the checks") }, { status: 500 });
  }
}

/**
 * POST { key, reason }: accept a "Please check" with a reason (10 to 500
 * characters); { key, withdraw: true } takes the acceptance back.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const body = (await request.json().catch(() => ({}))) as { key?: unknown; reason?: unknown; withdraw?: unknown };
    const key = typeof body.key === "string" ? body.key : "";
    if (body.withdraw === true) {
      const removed = await prisma.checkAcceptance.deleteMany({ where: { submissionId: id, checkKey: key } });
      if (removed.count > 0) {
        await recordActivity({
          actorId: auth.user.id,
          action: "CHECK_ACCEPTANCE_WITHDRAWN",
          entityType: "SUBMISSION",
          entityId: id,
          description: `Took back the acceptance of check ${key}; it is open again.`,
          metadata: { key },
        });
      }
      return NextResponse.json({ ok: true });
    }
    const finding = (await runChecks(id)).find((result) => result.key === key);
    if (!finding) return NextResponse.json({ error: "That check isn't open on this draft any more." }, { status: 404 });
    if (finding.level !== "CHECK") {
      return NextResponse.json({ error: "Only a \"Please check\" can be accepted; this one must be fixed." }, { status: 400 });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 10 || reason.length > 500) {
      return NextResponse.json({ error: "Give your reason in 10 to 500 characters." }, { status: 400 });
    }
    await prisma.checkAcceptance.upsert({
      where: { submissionId_checkKey: { submissionId: id, checkKey: key } },
      create: { submissionId: id, checkKey: key, reason, acceptedById: auth.user.id },
      update: { reason, acceptedById: auth.user.id, acceptedAt: new Date() },
    });
    await recordActivity({
      actorId: auth.user.id,
      action: "CHECK_ACCEPTED",
      entityType: "SUBMISSION",
      entityId: id,
      description: `Accepted check ${finding.rule} ("${finding.message}") with the reason: ${reason}`,
      metadata: { key, rule: finding.rule },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to accept the check:", error);
    return NextResponse.json({ error: couldNot("accept the check") }, { status: 500 });
  }
}
