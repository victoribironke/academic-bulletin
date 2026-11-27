import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { AssignmentError, markReady } from "@/lib/courses/assignments";
import { couldNot } from "@/lib/messages";

/** Task G2: POST - the lecturer marks a course "Ready for my Head". */
export async function POST(_request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  try {
    const auth = await requireApiUser(["LECTURER"]);
    if (!auth.ok) return auth.response;
    await markReady(auth.user, (await params).assignmentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssignmentError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to mark the course ready:", error);
    return NextResponse.json({ error: couldNot("mark the course ready") }, { status: 500 });
  }
}
