import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { registryScope } from "@/lib/courses/registry-scope";
import { loadRegistryRows } from "@/lib/courses/registry-facets";
import { facetCounts, matchesFilters, readFilters } from "@/lib/courses/registry-filters";
import { couldNot } from "@/lib/messages";

/**
 * Task K5: GET /api/master-courses/facets - each Registry filter's choices,
 * with how many courses each would show given the other filters and the
 * search. Only courses this person may see are counted (K6).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { searchParams } = new URL(request.url);
    const scope = await registryScope(auth.user, searchParams);
    if (!scope.ok) return NextResponse.json({ error: scope.error }, { status: 403 });
    const rows = await loadRegistryRows(scope.where);
    const filters = readFilters(searchParams);
    return NextResponse.json({
      facets: facetCounts(rows, filters),
      total: rows.filter((row) => matchesFilters(row, filters)).length,
    });
  } catch (error) {
    console.error("Failed to count the Registry filters:", error);
    return NextResponse.json({ error: couldNot("count the filters") }, { status: 500 });
  }
}
