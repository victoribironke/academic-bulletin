import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { lecturerCourses } from "@/lib/courses/assignments";
import { couldNot } from "@/lib/messages";

/** Task G2: GET /api/lecturer/courses - the courses given to this lecturer, and nothing else. */
export async function GET() {
  try {
    const auth = await requireApiUser(["LECTURER"]);
    if (!auth.ok) return auth.response;
    return NextResponse.json({ courses: await lecturerCourses(auth.user.id) });
  } catch (error) {
    console.error("Failed to load the lecturer's courses:", error);
    return NextResponse.json({ error: couldNot("load your courses") }, { status: 500 });
  }
}
