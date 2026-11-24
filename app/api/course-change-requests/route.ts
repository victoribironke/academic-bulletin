import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import {
  CHANGE_STATUSES,
  NOT_SWITCHED_ON_MESSAGE,
  isNotSwitchedOn,
  listChangeRequests,
  type ChangeStatus,
} from "@/lib/courses/course-list";

/** GET: DAP's queue of course change requests (task B10); ?status=OPEN to filter. */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const status = new URL(request.url).searchParams.get("status")?.toUpperCase();
    const filter = CHANGE_STATUSES.includes(status as ChangeStatus) ? (status as ChangeStatus) : undefined;
    return NextResponse.json(await listChangeRequests(filter));
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ error: NOT_SWITCHED_ON_MESSAGE, code: "NOT_SWITCHED_ON" }, { status: 503 });
    console.error("Failed to list course change requests:", error);
    return NextResponse.json({ error: "Failed to load the requests" }, { status: 500 });
  }
}
