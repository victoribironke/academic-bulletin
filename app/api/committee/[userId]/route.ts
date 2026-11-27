import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { requireDeleteConfirmation, readDeleteBody } from "@/lib/archive";
import { CoordinatorError, coordinatorsFor, removeCoordinator } from "@/lib/people/coordinators";
import { couldNot } from "@/lib/messages";

/** Task G2: DELETE { programmeId } - takes a committee member off a programme (typed DELETE). */
export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireApiUser(["HOD"]);
    if (!auth.ok) return auth.response;
    const body = await readDeleteBody(request.clone());
    const unconfirmed = await requireDeleteConfirmation(request, "committee member");
    if (unconfirmed) return unconfirmed;
    const removed = await removeCoordinator(auth.user, (await params).userId, body.programmeId, "COMMITTEE_MEMBER");
    return NextResponse.json({ ...removed, committee: await coordinatorsFor(auth.user, "COMMITTEE_MEMBER") });
  } catch (error) {
    if (error instanceof CoordinatorError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to take the committee member off:", error);
    return NextResponse.json({ error: couldNot("take the committee member off") }, { status: 500 });
  }
}
