import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canViewSubmission, requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { NO_ACCESS, couldNot } from "@/lib/messages";
import { readGroupFields } from "@/lib/courses/elective-groups";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Task W3: a draft's named elective groups. GET lists them with the units
 * each offers; POST { name, chooseUnits } adds one.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    const groups = await prisma.electiveGroup.findMany({
      where: { submissionId: id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, chooseUnits: true, courses: { select: { code: true, units: true }, orderBy: { code: "asc" } } },
    });
    return NextResponse.json({
      groups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        chooseUnits: group.chooseUnits,
        courses: group.courses.map((course) => course.code),
        offeredUnits: group.courses.reduce((sum, course) => sum + course.units, 0),
      })),
    });
  } catch (error) {
    console.error("Failed to list elective groups:", error);
    return NextResponse.json({ error: couldNot("load the elective groups") }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const fields = readGroupFields(await request.json().catch(() => ({})), { requireAll: true });
    if (!fields.ok) return NextResponse.json({ error: fields.message }, { status: 400 });
    const name = fields.name!;
    if (await prisma.electiveGroup.findFirst({ where: { submissionId: id, name: { equals: name, mode: "insensitive" } } })) {
      return NextResponse.json({ error: `This draft already has an elective group called "${name}".` }, { status: 409 });
    }
    const group = await prisma.electiveGroup.create({
      data: { submissionId: id, name, chooseUnits: fields.chooseUnits! },
      select: { id: true, name: true, chooseUnits: true },
    });
    await recordActivity({
      actorId: auth.user.id,
      action: "ELECTIVE_GROUP_ADDED",
      entityType: "SUBMISSION",
      entityId: id,
      description: `Added the elective group "${group.name}" (choose ${group.chooseUnits} units).`,
      metadata: { groupId: group.id },
    });
    return NextResponse.json({ ...group, courses: [], offeredUnits: 0 }, { status: 201 });
  } catch (error) {
    console.error("Failed to add an elective group:", error);
    return NextResponse.json({ error: couldNot("add the elective group") }, { status: 500 });
  }
}
