import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { applyRegistryUpload, planRegistryUpload, preloadAfterUpload } from "@/lib/imports/registry-upload";
import { couldNot } from "@/lib/messages";

const MAX_IMPORT_ROWS = 5000;

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "At least one course row is required" }, { status: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        { error: `A maximum of ${MAX_IMPORT_ROWS} courses can be imported at once.` },
        { status: 400 },
      );
    }

    // Repeats of an earlier row in the file are skipped, not imported (B17);
    // old school, department and programme codes are accepted with a warning (A5).
    const plan = await planRegistryUpload(rows);
    if (plan.invalid.length > 0) {
      return NextResponse.json(
        { error: "The import contains invalid or duplicate Registry rows.", issues: plan.invalid },
        { status: 400 },
      );
    }
    if (plan.ownerIssues.length > 0) {
      return NextResponse.json({ error: "Some owner codes do not exist.", issues: plan.ownerIssues }, { status: 400 });
    }

    const result = await applyRegistryUpload(plan, { actorId: auth.user.id });
    const submissionsPreloaded = await preloadAfterUpload(plan, result);

    return NextResponse.json(
      {
        imported: result.created,
        updated: result.updated,
        linked: result.linked,
        submissionsPreloaded,
        unmatchedSourceProgrammes: plan.unmatchedSourceProgrammes,
        ambiguousSourceProgrammes: plan.ambiguousSourceProgrammes,
        // Rows that used an old school, department or programme code (A5).
        codeWarnings: plan.codeWarnings,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to bulk import Registry courses:", error);
    return NextResponse.json({ error: couldNot("import Registry courses") }, { status: 500 });
  }
}
