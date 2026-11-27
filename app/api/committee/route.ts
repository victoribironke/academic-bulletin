import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { CoordinatorError, coordinatorsFor, nameCoordinator } from "@/lib/people/coordinators";
import { couldNot } from "@/lib/messages";

const failed = (error: unknown, what: string) => {
  if (error instanceof CoordinatorError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`Failed to ${what}:`, error);
  return NextResponse.json({ error: couldNot(what) }, { status: 500 });
};

/**
 * Task G2: committee members read and comment on the programmes the Head
 * names for them. GET lists them per programme; POST { email, firstName,
 * lastName, programmeIds } names one (invited).
 */
export async function GET() {
  try {
    const auth = await requireApiUser(["HOD"]);
    if (!auth.ok) return auth.response;
    return NextResponse.json(await coordinatorsFor(auth.user, "COMMITTEE_MEMBER"));
  } catch (error) {
    return failed(error, "load the committee members");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["HOD"]);
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const named = await nameCoordinator(auth.user, body, "COMMITTEE_MEMBER");
    return NextResponse.json({ ...named, committee: await coordinatorsFor(auth.user, "COMMITTEE_MEMBER") });
  } catch (error) {
    return failed(error, "name the committee member");
  }
}
