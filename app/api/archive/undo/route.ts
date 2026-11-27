import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { UNDOABLE_TYPES, UNDO_WINDOW_SECONDS, undoRecentArchive, type ArchivableType } from "@/lib/archive";
import { couldNot } from "@/lib/messages";

/**
 * Task U3: POST /api/archive/undo { entityType, entityIds } - the "Undo"
 * link after a delete. Puts back only what this person deleted in the last
 * two minutes; anything else is restored from the Archive by DAP.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => ({}))) as { entityType?: unknown; entityIds?: unknown };
    const type = typeof body.entityType === "string" && UNDOABLE_TYPES.includes(body.entityType as ArchivableType) ? (body.entityType as ArchivableType) : null;
    const ids = Array.isArray(body.entityIds) ? body.entityIds.filter((id): id is string => typeof id === "string").slice(0, 500) : [];
    if (!type || ids.length === 0) {
      return NextResponse.json({ error: "Nothing to undo." }, { status: 400 });
    }
    const result = await undoRecentArchive(auth.user.id, type, ids);
    if (result.restored === 0) {
      return NextResponse.json(
        {
          error:
            result.errors[0] ??
            `It's more than ${UNDO_WINDOW_SECONDS / 60} minutes since it was deleted, or someone else deleted it. Ask DAP to restore it from the Archive.`,
        },
        { status: 409 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to undo a delete:", error);
    return NextResponse.json({ error: couldNot("undo that") }, { status: 500 });
  }
}
