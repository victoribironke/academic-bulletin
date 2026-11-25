import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { readDeleteBody, requireDeleteConfirmation } from "@/lib/archive";
import { CoordinatorError, coordinatorsFor, removeCoordinator } from "@/lib/people/coordinators";

type RouteParams = { params: Promise<{ userId: string }> };

/**
 * DELETE /api/coordinators/:userId - The Head takes a coordinator off one
 * programme, after DELETE is typed (Q7): { programmeId, confirm }. Nothing
 * they wrote is removed; with no programme left, their account is switched
 * off (G2).
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["HOD"]);
    if (!auth.ok) return auth.response;
    const { userId } = await params;
    const body = await readDeleteBody(request.clone());
    const unconfirmed = await requireDeleteConfirmation(request, "coordinator");
    if (unconfirmed) return unconfirmed;
    const removed = await removeCoordinator(auth.user, userId, body.programmeId);
    return NextResponse.json({ ...removed, coordinators: await coordinatorsFor(auth.user) });
  } catch (error) {
    if (error instanceof CoordinatorError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Failed to remove the coordinator:", error);
    return NextResponse.json({ error: "Failed to remove the coordinator" }, { status: 500 });
  }
}
