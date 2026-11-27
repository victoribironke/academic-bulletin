import { NextResponse } from "next/server";
import { canViewSubmission, requireApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { requireDeleteConfirmation } from "@/lib/archive";
import { NO_ACCESS, couldNot } from "@/lib/messages";
import {
  alignSharedLevels,
  carryMessage,
  hasDifferences,
  sharedLevelDifferences,
} from "@/lib/programmes/option-families";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Rule W18. GET: this draft's option family (B.Agric.) and how the other
 * options' shared levels compare with it; { family: null } for any other
 * programme.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser(undefined, { limitedRoles: ["COMMITTEE_MEMBER"] });
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    return NextResponse.json((await sharedLevelDifferences(auth.user, id)) ?? { family: null });
  } catch (error) {
    console.error("Failed to compare the options' shared levels:", error);
    return NextResponse.json({ error: couldNot("compare the options") }, { status: 500 });
  }
}

/**
 * POST { confirm: "DELETE" }: make the other options' shared levels match
 * this draft. Rows only they have go to the Archive, so the DELETE word is
 * asked for, as for every removal (Q7).
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const gate = await requireSubmissionWriteAccess(auth.user, id);
    if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

    const before = await sharedLevelDifferences(auth.user, id);
    if (!before) return NextResponse.json({ error: "This programme has no options that share levels." }, { status: 400 });
    if (!before.options.some(hasDifferences)) {
      return NextResponse.json({ ...before, note: "The options already match." });
    }
    const unconfirmed = await requireDeleteConfirmation(request, "set of rows only the other options have");
    if (unconfirmed) return unconfirmed;

    const result = await alignSharedLevels(auth.user, id);
    const after = await sharedLevelDifferences(auth.user, id);
    return NextResponse.json({ ...after, note: carryMessage(result) });
  } catch (error) {
    console.error("Failed to match the options' shared levels:", error);
    return NextResponse.json({ error: couldNot("match the options") }, { status: 500 });
  }
}
