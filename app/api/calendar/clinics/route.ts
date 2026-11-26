import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { calendarNow } from "@/lib/clock";
import { clinicsForHome } from "@/lib/calendar/clinics";
import { couldNot } from "@/lib/messages";

/**
 * GET /api/calendar/clinics - The next clinics with DAP and their joining
 * links (task H8), for the Head of Department home page. DAP sets them on
 * the cycle's Calendar screen.
 */
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    // The test site's pretend clock, if a tester set one (section 13).
    return NextResponse.json(await clinicsForHome(await calendarNow()));
  } catch (error) {
    console.error("Failed to load the clinics:", error);
    return NextResponse.json({ error: couldNot("load the clinics") }, { status: 500 });
  }
}
