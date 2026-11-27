import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { requireDeleteConfirmation } from "@/lib/archive";
import { couldNot } from "@/lib/messages";
import { readGroupFields } from "@/lib/courses/elective-groups";

type RouteParams = { params: Promise<{ id: string; groupId: string }> };

async function findGroup(submissionId: string, groupId: string) {
  return prisma.electiveGroup.findFirst({ where: { id: groupId, submissionId }, select: { id: true, name: true, chooseUnits: true } });
}

/** W3: rename a group or change how many units a student chooses from it. */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id, groupId } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
    const existing = await findGroup(id, groupId);
    if (!existing) return NextResponse.json({ error: "That elective group isn't on this draft." }, { status: 404 });

    const fields = readGroupFields(await request.json().catch(() => ({})), { requireAll: false });
    if (!fields.ok) return NextResponse.json({ error: fields.message }, { status: 400 });
    if (fields.name && fields.name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = await prisma.electiveGroup.findFirst({
        where: { submissionId: id, name: { equals: fields.name, mode: "insensitive" }, NOT: { id: groupId } },
      });
      if (clash) return NextResponse.json({ error: `This draft already has an elective group called "${fields.name}".` }, { status: 409 });
    }
    const group = await prisma.electiveGroup.update({
      where: { id: groupId },
      data: { ...(fields.name && { name: fields.name }), ...(fields.chooseUnits !== undefined && { chooseUnits: fields.chooseUnits }) },
      select: { id: true, name: true, chooseUnits: true },
    });
    await recordActivity({
      actorId: auth.user.id,
      action: "ELECTIVE_GROUP_UPDATED",
      entityType: "SUBMISSION",
      entityId: id,
      description: `Updated the elective group "${group.name}" (choose ${group.chooseUnits} units).`,
      metadata: { groupId, from: existing },
    });
    return NextResponse.json(group);
  } catch (error) {
    console.error("Failed to update an elective group:", error);
    return NextResponse.json({ error: couldNot("update the elective group") }, { status: 500 });
  }
}

/** W3: remove a group once DELETE is typed (Q7); its courses become ungrouped electives. */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id, groupId } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
    const existing = await findGroup(id, groupId);
    if (!existing) return NextResponse.json({ error: "That elective group isn't on this draft." }, { status: 404 });
    const unconfirmed = await requireDeleteConfirmation(request, "elective group");
    if (unconfirmed) return unconfirmed;

    await prisma.$transaction(async (tx) => {
      const released = await tx.course.updateMany({ where: { submissionId: id, electiveGroupId: groupId }, data: { electiveGroupId: null } });
      await tx.electiveGroup.delete({ where: { id: groupId } });
      await recordActivity(
        {
          actorId: auth.user.id,
          action: "ELECTIVE_GROUP_REMOVED",
          entityType: "SUBMISSION",
          entityId: id,
          description: `Removed the elective group "${existing.name}"; its ${released.count} course${released.count === 1 ? "" : "s"} stay as ungrouped electives.`,
          metadata: { group: existing, courses: released.count },
        },
        tx,
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove an elective group:", error);
    return NextResponse.json({ error: couldNot("remove the elective group") }, { status: 500 });
  }
}
