import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/run";
import { isNotSwitchedOn } from "@/lib/courses/course-list";
import { NOT_SIGNED_IN } from "@/lib/messages";

/**
 * The reminder agent's scheduled run (T3): call it at 7:00 and at 8:00 am
 * West Africa Time on working days. At 7:00 it prepares the day's messages;
 * at 8:00 it sends those DAP hasn't held, if sending is switched on. Safe to
 * call more often: each message is prepared and sent once.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: NOT_SIGNED_IN }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runAgent(new Date())) });
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ ok: false, switchedOn: false });
    console.error("The reminder agent's run failed:", error);
    return NextResponse.json({ ok: false, error: "The reminder agent's run failed" }, { status: 500 });
  }
}
