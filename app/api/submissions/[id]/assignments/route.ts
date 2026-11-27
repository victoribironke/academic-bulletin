import { NextResponse } from "next/server";
import { canViewSubmission, requireApiUser } from "@/lib/api-auth";
import { AssignmentError, assignCourse, assignmentsFor, decideAssignment } from "@/lib/courses/assignments";
import { NO_ACCESS, couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

const failed = (error: unknown, what: string) => {
  if (error instanceof AssignmentError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`Failed to ${what}:`, error);
  return NextResponse.json({ error: couldNot(what) }, { status: 500 });
};

/** Task G2. GET: the department's lecturers and who has each course, with counts by status. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    return NextResponse.json(await assignmentsFor(auth.user, id));
  } catch (error) {
    return failed(error, "load the lecturers' courses");
  }
}

/** POST { courseId, lecturerId | null }: give a course to a lecturer, or take it back. */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => ({}))) as { courseId?: unknown; lecturerId?: unknown };
    if (typeof body.courseId !== "string") return NextResponse.json({ error: "Choose a course." }, { status: 400 });
    const lecturerId = typeof body.lecturerId === "string" && body.lecturerId ? body.lecturerId : null;
    await assignCourse(auth.user, id, body.courseId, lecturerId);
    return NextResponse.json(await assignmentsFor(auth.user, id));
  } catch (error) {
    return failed(error, "give the course to the lecturer");
  }
}

/** PATCH { assignmentId, action: "accept" | "return", note }: the Head decides on the lecturer's work. */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => ({}))) as { assignmentId?: unknown; action?: unknown; note?: unknown };
    if (typeof body.assignmentId !== "string") return NextResponse.json({ error: "Choose a course." }, { status: 400 });
    await decideAssignment(auth.user, id, body.assignmentId, body.action, body.note);
    return NextResponse.json(await assignmentsFor(auth.user, id));
  } catch (error) {
    return failed(error, "record the decision");
  }
}
