import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { sendDueInvitations, uninvitedPeople } from "@/lib/people/invitations";

/** GET /api/invitations - Who is still waiting for an invitation (task D3). */
export async function GET() {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ waiting: await uninvitedPeople() });
}

/**
 * POST /api/invitations - Send every waiting invitation now. The daily job
 * does this itself from 8:00 am WAT on Thursday, November 26, 2026; this is
 * for DAP to send them at a moment of its choosing.
 */
export async function POST() {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { results } = await sendDueInvitations(new Date(), { evenBeforeLaunch: true });
  const sent = results.filter((result) => result.sent).length;
  await recordActivity({
    actorId: auth.user.id,
    action: "INVITATIONS_SENT",
    entityType: "USER",
    description: `Sent ${sent} Academic Bulletin invitation${sent === 1 ? "" : "s"}${results.length > sent ? `; ${results.length - sent} could not be sent` : ""}.`,
    metadata: { results },
  });
  return NextResponse.json({ sent, results });
}
