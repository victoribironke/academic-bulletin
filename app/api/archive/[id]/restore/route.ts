import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { restoreArchivedRecord } from "@/lib/archive";

/**
 * POST /api/archive/[id]/restore
 *
 * Puts a deleted record back with its original id. Refused while its school
 * or department is itself in the Archive, or when another record has taken
 * its name or code.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const result = await restoreArchivedRecord(id, auth.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to restore an archived record:", error);
    return NextResponse.json(
      { error: "Failed to restore this record" },
      { status: 500 },
    );
  }
}
