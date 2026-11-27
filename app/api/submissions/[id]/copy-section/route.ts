import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { canWriteSubmission, requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { COPYABLE_SECTIONS, hasWords } from "@/lib/submissions/copy-section";
import { couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

/** The other drafts of the same department in the same cycle. */
async function siblings(id: string) {
  const draft = await prisma.submission.findUnique({
    where: { id },
    select: { cycleId: true, programme: { select: { departmentId: true } } },
  });
  if (!draft) return null;
  const others = await prisma.submission.findMany({
    where: { id: { not: id }, cycleId: draft.cycleId, programme: { departmentId: draft.programme.departmentId } },
    select: { id: true, content: true, programme: { select: { name: true } } },
    orderBy: { programme: { name: "asc" } },
  });
  return others;
}

/**
 * Task G8. GET ?section=overview: the department's other programmes, whether
 * each already has words in that section (they would be replaced) and
 * whether this person may write it.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
    const section = new URL(request.url).searchParams.get("section") ?? "";
    const spec = COPYABLE_SECTIONS[section];
    if (!spec) return NextResponse.json({ error: "This section can't be copied." }, { status: 400 });
    const others = (await siblings(id)) ?? [];
    const programmes = await Promise.all(
      others.map(async (other) => ({
        id: other.id,
        name: other.programme.name,
        hasWords: spec.fields.some((field) => hasWords((other.content as Record<string, unknown> | null)?.[field])),
        canWrite: await canWriteSubmission(auth.user, other.id),
      })),
    );
    return NextResponse.json({ section: spec.title, programmes });
  } catch (error) {
    console.error("Failed to list programmes to copy to:", error);
    return NextResponse.json({ error: couldNot("list the other programmes") }, { status: 500 });
  }
}

/** POST { section, targetIds }: copies this draft's saved words in the section to each target. */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const body = (await request.json().catch(() => ({}))) as { section?: unknown; targetIds?: unknown };
    const spec = typeof body.section === "string" ? COPYABLE_SECTIONS[body.section] : undefined;
    if (!spec) return NextResponse.json({ error: "This section can't be copied." }, { status: 400 });
    const wanted = Array.isArray(body.targetIds) ? body.targetIds.filter((item): item is string => typeof item === "string") : [];
    if (wanted.length === 0) return NextResponse.json({ error: "Choose the programmes to copy to." }, { status: 400 });

    const others = (await siblings(id)) ?? [];
    const targets = others.filter((other) => wanted.includes(other.id));
    if (targets.length !== wanted.length) {
      return NextResponse.json({ error: "Copy only to programmes of the same department in this cycle." }, { status: 400 });
    }
    for (const target of targets) {
      if (!(await canWriteSubmission(auth.user, target.id))) {
        return NextResponse.json({ error: `You can't edit ${target.programme.name} now.` }, { status: 403 });
      }
    }

    const source = await prisma.submissionContent.findUnique({ where: { submissionId: id } });
    // An empty JSON field is written as a database null.
    const JSON_FIELDS = new Set(["objectives", "uniqueFeatures", "sectionF", "sectionG"]);
    const values = Object.fromEntries(
      spec.fields.map((field) => {
        const value = (source as Record<string, unknown> | null)?.[field] ?? null;
        return [field, value === null && JSON_FIELDS.has(field) ? Prisma.DbNull : value];
      }),
    );
    if (!spec.fields.some((field) => hasWords(values[field]))) {
      return NextResponse.json({ error: `This programme's ${spec.title} is empty. Write it first.` }, { status: 400 });
    }
    const data = values as Prisma.SubmissionContentUncheckedUpdateInput;

    await prisma.$transaction(async (tx) => {
      for (const target of targets) {
        const existing = await tx.submissionContent.findUnique({ where: { submissionId: target.id }, select: { carriedFields: true } });
        // E2: a copied field is no longer the 2023-2027 text waiting for review.
        const carriedFields = (existing?.carriedFields ?? []).filter((field) => !spec.fields.includes(field));
        await tx.submissionContent.upsert({
          where: { submissionId: target.id },
          update: { ...data, carriedFields },
          create: { ...(data as Prisma.SubmissionContentUncheckedCreateInput), submissionId: target.id },
        });
        await recordActivity(
          {
            actorId: auth.user.id,
            action: "SECTION_COPIED",
            entityType: "SUBMISSION",
            entityId: target.id,
            description: `Copied the ${spec.title} from another programme of the department; adjust it for ${target.programme.name}.`,
            metadata: { from: id, fields: spec.fields },
          },
          tx,
        );
      }
    });
    return NextResponse.json({ copied: targets.map((target) => target.programme.name) });
  } catch (error) {
    console.error("Failed to copy the section:", error);
    return NextResponse.json({ error: couldNot("copy the section") }, { status: 500 });
  }
}
