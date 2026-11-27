import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { CoordinatorError } from "@/lib/people/coordinators";
import { lecturersFor, nameLecturer } from "@/lib/people/lecturers";
import { couldNot } from "@/lib/messages";

const failed = (error: unknown, what: string) => {
  if (error instanceof CoordinatorError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`Failed to ${what}:`, error);
  return NextResponse.json({ error: couldNot(what) }, { status: 500 });
};

/** Task G2: GET - the Head's lecturers; POST { email, firstName, lastName } - adds one (invited). */
export async function GET() {
  try {
    const auth = await requireApiUser(["HOD"]);
    if (!auth.ok) return auth.response;
    return NextResponse.json(await lecturersFor(auth.user));
  } catch (error) {
    return failed(error, "load the lecturers");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["HOD"]);
    if (!auth.ok) return auth.response;
    const named = await nameLecturer(auth.user, (await request.json().catch(() => ({}))) as Record<string, unknown>);
    return NextResponse.json({ ...named, ...(await lecturersFor(auth.user)) });
  } catch (error) {
    return failed(error, "add the lecturer");
  }
}
