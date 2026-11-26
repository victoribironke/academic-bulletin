import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  CHANGE_STATUSES,
  NOT_SWITCHED_ON_MESSAGE,
  isNotSwitchedOn,
  resolveChangeRequest,
  type ChangeStatus,
} from "@/lib/courses/course-list";
import { couldNot } from "@/lib/messages";

/**
 * PATCH: DAP marks a course change request done or declined, or reopens it:
 * { status, response }. Declining needs a reply for the Head.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { status?: unknown; response?: unknown };
    const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
    if (!CHANGE_STATUSES.includes(status as ChangeStatus)) {
      return NextResponse.json({ error: "Choose Done, Declined or Open." }, { status: 400 });
    }
    const response = typeof body.response === "string" ? body.response.trim().slice(0, 1000) || null : null;
    if (status === "DECLINED" && !response) {
      return NextResponse.json({ error: "Tell the Head of Department why it was declined." }, { status: 400 });
    }
    const updated = await resolveChangeRequest(id, auth.user.id, { status: status as ChangeStatus, response });
    if (!updated) return NextResponse.json({ error: "That request no longer exists." }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ error: NOT_SWITCHED_ON_MESSAGE, code: "NOT_SWITCHED_ON" }, { status: 503 });
    console.error("Failed to update a course change request:", error);
    return NextResponse.json({ error: couldNot("update the request") }, { status: 500 });
  }
}
