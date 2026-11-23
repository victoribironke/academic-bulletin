import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { sendInvitation } from "@/lib/people/invitations";

/** POST /api/users/[id]/invite - Send someone's invitation, or send it again (task D3). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const result = await sendInvitation(id);
  if (!result.sent) {
    return NextResponse.json({ error: result.reason ?? "The invitation wasn't sent.", ...result }, { status: 409 });
  }
  await recordActivity({
    actorId: auth.user.id,
    action: "INVITATION_SENT",
    entityType: "USER",
    entityId: id,
    description: `Sent the Academic Bulletin invitation to ${result.email}.`,
  });
  return NextResponse.json(result);
}
