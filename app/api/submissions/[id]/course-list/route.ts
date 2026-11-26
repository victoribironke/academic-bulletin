import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canViewSubmission, requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import {
  NOT_SWITCHED_ON_MESSAGE,
  confirmCourseList,
  getCourseListState,
  isNotSwitchedOn,
} from "@/lib/courses/course-list";
import { NO_ACCESS, couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

/** GET: the course list's confirmation and change requests (task B10). */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    return NextResponse.json(await getCourseListState(id));
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ error: NOT_SWITCHED_ON_MESSAGE, code: "NOT_SWITCHED_ON" }, { status: 503 });
    console.error("Failed to read the course list confirmation:", error);
    return NextResponse.json({ error: couldNot("load the course list confirmation") }, { status: 500 });
  }
}

/**
 * POST: the Head of Department confirms the course list as it stands. Only
 * the department's Head (or a Super Administrator, for support) confirms, and
 * only while they can edit the draft.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser(["HOD", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
    if (auth.user.role === "HOD") {
      const draft = await prisma.submission.findUnique({
        where: { id },
        select: { programme: { select: { departmentId: true } } },
      });
      if (draft?.programme.departmentId !== auth.user.departmentId) {
        return NextResponse.json({ error: "Only this department's Head confirms its course list." }, { status: 403 });
      }
    }
    await confirmCourseList(id, auth.user.id);
    return NextResponse.json(await getCourseListState(id));
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ error: NOT_SWITCHED_ON_MESSAGE, code: "NOT_SWITCHED_ON" }, { status: 503 });
    console.error("Failed to confirm the course list:", error);
    return NextResponse.json({ error: couldNot("confirm the course list") }, { status: 500 });
  }
}
