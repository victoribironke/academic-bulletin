import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { removeArchivedRecord, requireDeleteConfirmation } from "@/lib/archive";
import { couldNot } from "@/lib/messages";

/**
 * DELETE /api/archive/[id]
 *
 * Removes a record from the Archive for good, so it can no longer be
 * restored. Only Super Administrators, and only with DELETE typed again
 * (work order Q7, Appendix D). Logged.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser(["SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const unconfirmed = await requireDeleteConfirmation(request, "record for good");
    if (unconfirmed) return unconfirmed;

    const { id } = await params;
    const result = await removeArchivedRecord(id, auth.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to remove an archived record:", error);
    return NextResponse.json(
      { error: couldNot("remove this record from the Archive") },
      { status: 500 },
    );
  }
}
