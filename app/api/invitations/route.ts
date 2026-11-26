import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { invitationsHold, sendDueInvitations, setInvitationsHold, uninvitedPeople } from "@/lib/people/invitations";

/** GET /api/invitations - Who is still waiting for an invitation, and whether DAP holds them (task D3). */
export async function GET() {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ waiting: await uninvitedPeople(), hold: await invitationsHold() });
}

/**
 * PUT /api/invitations - DAP holds or releases the invitations:
 * { hold: true | false, reason? }. While held, the daily job sends none.
 */
export async function PUT(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => ({}))) as { hold?: unknown; reason?: unknown };
  if (typeof body.hold !== "boolean") return NextResponse.json({ error: "Say whether to hold the invitations." }, { status: 400 });
  const hold = await setInvitationsHold(body.hold, auth.user.id, typeof body.reason === "string" ? body.reason : null);
  return NextResponse.json({ hold });
}

/**
 * POST /api/invitations - Send every waiting invitation now. The daily job
 * does this itself from 8:00 am WAT on Thursday, November 26, 2026; this is
 * for DAP to send them at a moment of its choosing. Refused while held.
 */
export async function POST() {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
  if (!auth.ok) return auth.response;
  if ((await invitationsHold()).held) {
    return NextResponse.json(
      { error: "The invitations are on hold. Release the hold first, then send them.", code: "INVITATIONS_HELD" },
      { status: 409 },
    );
  }
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
