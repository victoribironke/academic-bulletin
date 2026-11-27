import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { addPolicyVersion, checkPolicyUpload, readPolicy, type PolicyUpload } from "@/lib/policy/library";
import { couldNot } from "@/lib/messages";

/**
 * GET /api/policy[?version=<id>]: the Academic Policy (task H9), split into
 * sections, with the list of versions. Everyone signed in can read it.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(undefined, { limitedRoles: ["LECTURER", "COMMITTEE_MEMBER"] });
    if (!auth.ok) return auth.response;
    const versionId = new URL(request.url).searchParams.get("version");
    const policy = await readPolicy(versionId);
    if (!policy) return NextResponse.json({ error: "No such version of the Academic Policy." }, { status: 404 });
    return NextResponse.json(policy, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    console.error("Failed to read the Academic Policy:", error);
    return NextResponse.json({ error: couldNot("load the Academic Policy") }, { status: 500 });
  }
}

/**
 * POST /api/policy { label, note?, sourceName?, content }: Academic Planning
 * uploads a new version (markdown); it becomes the current one. Earlier
 * versions stay readable.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => ({}))) as Partial<PolicyUpload>;
    const problem = checkPolicyUpload(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const version = await addPolicyVersion(body as PolicyUpload, auth.user.id);
    return NextResponse.json(version, { status: 201 });
  } catch (error) {
    console.error("Failed to upload the Academic Policy:", error);
    return NextResponse.json({ error: couldNot("upload the Academic Policy") }, { status: 500 });
  }
}
