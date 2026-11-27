import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { aiRateLimitResponse } from "@/lib/rate-limit";
import { explainComment } from "@/lib/assistant";
import { COPYABLE_SECTIONS } from "@/lib/submissions/copy-section";
import { CONFLICT_FIELDS, conflictValue } from "@/lib/submissions/edit-conflicts";
import { couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

const SECTION_TITLES: Record<string, string> = {
  deans_hods: "Deans & HODs",
  staff: "Staff Directory",
  overview: "Programme Overview",
  admission: "Admission Requirements",
  graduation: "Graduation Requirements",
  courses: "Course Structure",
  descriptions: "Course Details",
  regulations: "Regulations & Changes",
};

/**
 * Task H7: POST { action: "explain-comment", commentId } explains a
 * reviewer's comment in plain words and suggests what to change. Nothing
 * is changed on the draft; the person decides.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const body = (await request.json().catch(() => ({}))) as { action?: unknown; commentId?: unknown };
    if (body.action !== "explain-comment" || typeof body.commentId !== "string") {
      return NextResponse.json({ error: "Ask the helper to explain one comment." }, { status: 400 });
    }
    const comment = await prisma.comment.findFirst({
      where: { id: body.commentId, submissionId: id },
      select: { content: true, section: true, author: { select: { firstName: true, lastName: true } } },
    });
    if (!comment) return NextResponse.json({ error: "That comment isn't on this draft." }, { status: 404 });

    const limited = await aiRateLimitResponse("assistant", auth.user.id);
    if (limited) return limited;

    const draft = await prisma.submission.findUniqueOrThrow({
      where: { id },
      select: { programme: { select: { name: true } }, content: true },
    });
    const section = comment.section ?? "overview";
    const fields = COPYABLE_SECTIONS[section]?.fields ?? [];
    const content = (draft.content ?? {}) as Record<string, unknown>;
    const sectionText = fields
      .map((field) => {
        const text = conflictValue(content[field]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        return text ? `${CONFLICT_FIELDS[field] ?? field}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");

    const result = await explainComment({
      programme: draft.programme.name,
      sectionTitle: SECTION_TITLES[section] ?? section,
      sectionText,
      comment: comment.content,
      author: `${comment.author.firstName} ${comment.author.lastName}`.trim(),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 503 });
    return NextResponse.json({ explanation: result.text });
  } catch (error) {
    console.error("The AI helper failed:", error);
    return NextResponse.json({ error: couldNot("explain the comment") }, { status: 500 });
  }
}
