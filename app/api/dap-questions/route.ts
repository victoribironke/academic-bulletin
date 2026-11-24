import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { calendarNow } from "@/lib/clock";
import { ASK_DAP_NOT_SWITCHED_ON, dapInbox, isNotSwitchedOn } from "@/lib/help/ask-dap";

/**
 * GET: DAP's inbox of questions (task H6), with status and overdue flags.
 * ?status=open or answered; ?mine=1 for the questions sent to the caller.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const params = new URL(request.url).searchParams;
    const status = params.get("status")?.toUpperCase();
    return NextResponse.json(
      await dapInbox(
        {
          status: status === "OPEN" || status === "ANSWERED" ? status : undefined,
          officerId: params.get("mine") === "1" ? auth.user.id : undefined,
        },
        await calendarNow(),
      ),
    );
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json({ error: ASK_DAP_NOT_SWITCHED_ON, code: "NOT_SWITCHED_ON" }, { status: 503 });
    console.error("Failed to load the DAP inbox:", error);
    return NextResponse.json({ error: "Failed to load the questions" }, { status: 500 });
  }
}
