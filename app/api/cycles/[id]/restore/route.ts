import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { restoreCycle } from "@/lib/cycles/archive";

/** POST: brings an archived cycle back from the Archive, closed (task A2). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const result = await restoreCycle({ cycleId: id, actorId: auth.user.id });
    if (!result.ok) {
      return NextResponse.json({ error: result.message, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ restored: true, summary: result.summary });
  } catch (error) {
    console.error("Failed to restore review cycle:", error);
    return NextResponse.json({ error: "Failed to restore the review cycle" }, { status: 500 });
  }
}
