import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { requireDeleteConfirmation } from "@/lib/archive";
import { CoordinatorError } from "@/lib/people/coordinators";
import { lecturersFor, removeLecturer } from "@/lib/people/lecturers";
import { couldNot } from "@/lib/messages";

/** Task G2: DELETE - takes a lecturer off (typed DELETE); their courses come back to the Head. */
export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireApiUser(["HOD"]);
    if (!auth.ok) return auth.response;
    const unconfirmed = await requireDeleteConfirmation(request, "lecturer");
    if (unconfirmed) return unconfirmed;
    const removed = await removeLecturer(auth.user, (await params).userId);
    return NextResponse.json({ ...removed, ...(await lecturersFor(auth.user)) });
  } catch (error) {
    if (error instanceof CoordinatorError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to take the lecturer off:", error);
    return NextResponse.json({ error: couldNot("take the lecturer off") }, { status: 500 });
  }
}
