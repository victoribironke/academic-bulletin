import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { loadCoursesWeOwn } from "@/lib/courses/courses-we-own";

// GET /api/courses-we-own?owner=<dept:id|school:id|ge|none> - B6: the courses an owner teaches
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const owner = new URL(request.url).searchParams.get("owner");
    const result = await loadCoursesWeOwn(auth.user, owner);
    if (!result) {
      return NextResponse.json({ error: "There is no course list for your role." }, { status: 403 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load courses we own:", error);
    return NextResponse.json({ error: "Couldn't load the courses." }, { status: 500 });
  }
}
