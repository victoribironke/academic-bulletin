import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canViewSubmission, requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { fileKeyFromUrl } from "@/lib/storage";
import { LEADER_ROLE_LABEL, MAX_LEADER_NAME, MAX_LEADER_TITLE, resolveLeaders } from "@/lib/leaders";
import { NO_ACCESS, couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

async function draftPlace(id: string) {
  return prisma.submission.findUnique({
    where: { id },
    select: {
      content: { select: { programmeInfo: true } },
      programme: {
        select: {
          department: {
            select: {
              id: true,
              name: true,
              hodTitle: true,
              hodName: true,
              hodImageUrl: true,
              school: { select: { id: true, name: true, deanTitle: true, deanName: true, deanImageUrl: true } },
            },
          },
        },
      },
    },
  });
}

/** Task E4: the Dean and the Head of Department, as every programme there shows them. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    const draft = await draftPlace(id);
    if (!draft) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const department = draft.programme.department;
    return NextResponse.json({
      leaders: resolveLeaders(department.school, department, draft.content?.programmeInfo),
      school: department.school.name,
      department: department.name,
    });
  } catch (error) {
    console.error("Failed to load the Dean and Head of Department:", error);
    return NextResponse.json({ error: couldNot("load the Dean and Head of Department") }, { status: 500 });
  }
}

/**
 * PATCH { role: "dean" | "hod", title?, name?, imageUrl? }: saved on the
 * school (Dean) or the department (Head), so every programme there shows it.
 * Whoever may edit this draft may change them; each change is logged.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const body = (await request.json().catch(() => ({}))) as { role?: unknown; title?: unknown; name?: unknown; imageUrl?: unknown };
    const role = body.role === "dean" || body.role === "hod" ? body.role : null;
    if (!role) return NextResponse.json({ error: "Say whether this is the Dean or the Head of Department." }, { status: 400 });

    const text = (value: unknown, max: number) => {
      if (value === undefined) return { ok: true as const, value: undefined };
      if (value === null) return { ok: true as const, value: null };
      if (typeof value !== "string") return { ok: false as const };
      const cleaned = value.replace(/\s+/g, " ").trim();
      return cleaned.length > max ? { ok: false as const } : { ok: true as const, value: cleaned || null };
    };
    const title = text(body.title, MAX_LEADER_TITLE);
    const name = text(body.name, MAX_LEADER_NAME);
    if (!title.ok) return NextResponse.json({ error: `Keep the title to ${MAX_LEADER_TITLE} characters, for example "Prof." or "Dr.".` }, { status: 400 });
    if (!name.ok) return NextResponse.json({ error: `Keep the name to ${MAX_LEADER_NAME} characters.` }, { status: 400 });
    // Only a photo uploaded to the app (and checked there) can be used.
    let imageUrl: string | null | undefined;
    if (body.imageUrl === null) imageUrl = null;
    else if (typeof body.imageUrl === "string") {
      if (!fileKeyFromUrl(body.imageUrl)) return NextResponse.json({ error: "Upload the photo here first." }, { status: 400 });
      imageUrl = body.imageUrl;
    }

    const draft = await draftPlace(id);
    if (!draft) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const department = draft.programme.department;
    const changes: Record<string, string | null> = {};
    if (title.value !== undefined) changes[`${role}Title`] = title.value;
    if (name.value !== undefined) changes[`${role}Name`] = name.value;
    if (imageUrl !== undefined) changes[`${role}ImageUrl`] = imageUrl;
    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ leaders: resolveLeaders(department.school, department, draft.content?.programmeInfo) });
    }

    const where = role === "dean" ? department.school : department;
    await prisma.$transaction(async (tx) => {
      if (role === "dean") await tx.school.update({ where: { id: department.school.id }, data: changes });
      else await tx.department.update({ where: { id: department.id }, data: changes });
      await recordActivity(
        {
          actorId: auth.user.id,
          action: "LEADER_UPDATED",
          entityType: role === "dean" ? "SCHOOL" : "DEPARTMENT",
          entityId: where.id,
          description: `Updated the ${LEADER_ROLE_LABEL[role]}'s ${Object.keys(changes)
            .map((key) => key.replace(role, "").replace("ImageUrl", "photo").toLowerCase())
            .join(" and ")} for ${where.name}, from a programme draft.`,
          metadata: { submissionId: id, changes },
        },
        tx,
      );
    });
    const updated = await draftPlace(id);
    const after = updated!.programme.department;
    return NextResponse.json({ leaders: resolveLeaders(after.school, after, updated!.content?.programmeInfo) });
  } catch (error) {
    console.error("Failed to save the Dean or Head of Department:", error);
    return NextResponse.json({ error: couldNot("save the Dean or Head of Department") }, { status: 500 });
  }
}
