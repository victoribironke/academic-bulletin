import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { CoordinatorError, coordinatorsFor, nameCoordinator } from "@/lib/people/coordinators";

const failed = (error: unknown, what: string) => {
  if (error instanceof CoordinatorError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(`Failed to ${what}:`, error);
  return NextResponse.json({ error: `Failed to ${what}` }, { status: 500 });
};

/** GET /api/coordinators - The Head's programmes and their coordinators (G2). */
export async function GET() {
  try {
    const auth = await requireApiUser(["HOD"]);
    if (!auth.ok) return auth.response;
    return NextResponse.json(await coordinatorsFor(auth.user));
  } catch (error) {
    return failed(error, "load the coordinators");
  }
}

/**
 * POST /api/coordinators - The Head names a programme coordinator:
 * { email, firstName, lastName, programmeIds }. New coordinators are invited.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["HOD"]);
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const named = await nameCoordinator(auth.user, body);
    return NextResponse.json({ ...named, coordinators: await coordinatorsFor(auth.user) });
  } catch (error) {
    return failed(error, "name the coordinator");
  }
}
