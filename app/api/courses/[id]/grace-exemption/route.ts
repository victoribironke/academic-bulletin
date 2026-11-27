import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { GRACE_OVERRIDE_REASON_LENGTH } from "@/lib/grace-config";
import { couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

const course = (id: string) =>
  prisma.course.findUnique({
    where: { id },
    select: { id: true, code: true, submissionId: true, graceExemption: { select: { reason: true, createdAt: true, grantedBy: { select: { firstName: true, lastName: true } } } } },
  });

/**
 * Task F4: DAP lets a course past the GRACE gate with a reason (decision
 * DEC11), or takes the exemption back. Only Academic Planning may; each
 * change is logged against the programme.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const row = await course(id);
    if (!row) return NextResponse.json({ error: "Course not found" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const { min, max } = GRACE_OVERRIDE_REASON_LENGTH;
    if (reason.length < min || reason.length > max) {
      return NextResponse.json({ error: `Give the reason for the exemption in ${min} to ${max} characters.` }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.graceExemption.upsert({
        where: { courseId: id },
        create: { courseId: id, reason, grantedById: auth.user.id },
        update: { reason, grantedById: auth.user.id },
      });
      await recordActivity(
        {
          actorId: auth.user.id,
          action: "GRACE_EXEMPTION_GRANTED",
          entityType: "SUBMISSION",
          entityId: row.submissionId,
          description: `Exempted ${row.code} from the GRACE gate: ${reason}`,
          metadata: { courseId: id, reason },
        },
        tx,
      );
    });
    return NextResponse.json({ exempt: true, reason });
  } catch (error) {
    console.error("Failed to record the GRACE exemption:", error);
    return NextResponse.json({ error: couldNot("record the exemption") }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const row = await course(id);
    if (!row?.graceExemption) return NextResponse.json({ error: "That course has no exemption." }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await tx.graceExemption.delete({ where: { courseId: id } });
      await recordActivity(
        {
          actorId: auth.user.id,
          action: "GRACE_EXEMPTION_REMOVED",
          entityType: "SUBMISSION",
          entityId: row.submissionId,
          description: `Took back ${row.code}'s exemption from the GRACE gate; it must pass GRACE again.`,
          metadata: { courseId: id, previous: row.graceExemption!.reason },
        },
        tx,
      );
    });
    return NextResponse.json({ exempt: false });
  } catch (error) {
    console.error("Failed to remove the GRACE exemption:", error);
    return NextResponse.json({ error: couldNot("remove the exemption") }, { status: 500 });
  }
}
