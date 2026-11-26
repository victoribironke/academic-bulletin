import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { waitingWorkFor } from "@/lib/desk/waiting";
import { couldNot } from "@/lib/messages";

/**
 * GET /api/desk/waiting: what is waiting on the signed-in person (task T1),
 * most urgent first. Only their own desk's work.
 */
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const items = await waitingWorkFor(auth.user);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("Failed to work out the waiting work:", error);
    return NextResponse.json({ error: couldNot("load what is waiting on you") }, { status: 500 });
  }
}
