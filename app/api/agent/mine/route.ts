import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isNotSwitchedOn } from "@/lib/courses/course-list";
import { myAgentMessages } from "@/lib/agent/run";
import { couldNot } from "@/lib/messages";

/** GET: the person's last messages from the reminder agent (the in-app channel, T3). */
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    return NextResponse.json(await myAgentMessages(auth.user.id));
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json([], { status: 200 });
    console.error("Failed to load agent messages:", error);
    return NextResponse.json({ error: couldNot("load your messages") }, { status: 500 });
  }
}
