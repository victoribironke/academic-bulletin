import { NextResponse } from "next/server";
import { canViewSubmission, requireApiUser } from "@/lib/api-auth";
import { calendarNow } from "@/lib/clock";
import {
  ASK_DAP_NOT_SWITCHED_ON,
  askDap,
  isNotSwitchedOn,
  questionProblem,
  questionsForDraft,
} from "@/lib/help/ask-dap";
import { NO_ACCESS, couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

/** GET: the draft's questions to DAP and their answers (task H6). */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    return NextResponse.json(await questionsForDraft(id, await calendarNow()));
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ error: ASK_DAP_NOT_SWITCHED_ON, code: "NOT_SWITCHED_ON" }, { status: 503 });
    console.error("Failed to load questions to DAP:", error);
    return NextResponse.json({ error: couldNot("load the questions") }, { status: 500 });
  }
}

/**
 * POST: ask DAP about a section or field of the draft: { section, field,
 * question }. It goes to the DAP officer for the programme's school.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as { section?: unknown; field?: unknown; question?: unknown };
    const problem = questionProblem(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const created = await askDap(id, auth.user.id, {
      section: body.section as string,
      field: typeof body.field === "string" ? body.field : null,
      question: body.question as string,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ error: ASK_DAP_NOT_SWITCHED_ON, code: "NOT_SWITCHED_ON" }, { status: 503 });
    console.error("Failed to send a question to DAP:", error);
    return NextResponse.json({ error: couldNot("send the question") }, { status: 500 });
  }
}
