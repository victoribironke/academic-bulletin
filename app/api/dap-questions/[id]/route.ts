import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { ASK_DAP_NOT_SWITCHED_ON, answerQuestion, isNotSwitchedOn } from "@/lib/help/ask-dap";

/** PATCH: DAP answers a question: { answer }. The person who asked is told. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { answer?: unknown };
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (answer.length < 2) return NextResponse.json({ error: "Write the answer." }, { status: 400 });
    if (answer.length > 4000) return NextResponse.json({ error: "Keep the answer under 4,000 characters." }, { status: 400 });
    const updated = await answerQuestion(id, auth.user.id, answer);
    if (!updated) return NextResponse.json({ error: "That question no longer exists." }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ error: ASK_DAP_NOT_SWITCHED_ON, code: "NOT_SWITCHED_ON" }, { status: 503 });
    console.error("Failed to answer a question:", error);
    return NextResponse.json({ error: "Failed to save the answer" }, { status: 500 });
  }
}
