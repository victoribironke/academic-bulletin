import { NextResponse } from "next/server";
import { requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import {
  NOT_SWITCHED_ON_MESSAGE,
  changeRequestProblem,
  createChangeRequest,
  isNotSwitchedOn,
  type ChangeKind,
} from "@/lib/courses/course-list";
import { couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST: ask DAP to change the course list (task B10): { kind, courseCode,
 * details }. Anyone who can edit the draft may ask; the request goes to DAP's
 * queue.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const body = (await request.json().catch(() => ({}))) as { kind?: unknown; courseCode?: unknown; details?: unknown };
    const problem = changeRequestProblem(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const created = await createChangeRequest(id, auth.user.id, {
      kind: body.kind as ChangeKind,
      courseCode: typeof body.courseCode === "string" ? body.courseCode : null,
      details: body.details as string,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ error: NOT_SWITCHED_ON_MESSAGE, code: "NOT_SWITCHED_ON" }, { status: 503 });
    console.error("Failed to send a course change request:", error);
    return NextResponse.json({ error: couldNot("send the request") }, { status: 500 });
  }
}
