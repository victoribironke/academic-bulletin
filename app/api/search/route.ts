import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { searchEverything } from "@/lib/search/query";
import { isMissingSearchTable, refreshIfStale } from "@/lib/search/sync";

/**
 * GET /api/search?q=: everything a person may see that matches, grouped by
 * type (tasks K1 to K4, K6). Refreshes the index first when it is older than
 * the settings allow.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const query = new URL(request.url).searchParams.get("q") ?? "";
    await refreshIfStale();
    return NextResponse.json(await searchEverything(auth.user.role, query));
  } catch (error) {
    if (isMissingSearchTable(error)) {
      return NextResponse.json({ error: "Search isn't switched on yet on this site.", code: "NOT_SWITCHED_ON" }, { status: 503 });
    }
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
