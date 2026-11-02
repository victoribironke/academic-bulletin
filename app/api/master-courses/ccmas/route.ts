import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import {
  getCcmasCatalogueSummary,
  syncCcmasCatalogue,
} from "@/lib/courses/ccmas-catalogue";

export const maxDuration = 300;

export async function GET() {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const summary = getCcmasCatalogueSummary();
    const loadedCourses = await prisma.masterCourse.count({
      where: { curriculumSource: summary.version },
    });
    return NextResponse.json({ ...summary, loadedCourses });
  } catch (error) {
    console.error("Failed to read CCMAS catalogue status:", error);
    return NextResponse.json(
      { error: "Failed to read CCMAS catalogue status" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const result = await syncCcmasCatalogue(auth.user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to synchronise the CCMAS catalogue:", error);
    return NextResponse.json(
      { error: "Failed to synchronise the CCMAS catalogue" },
      { status: 500 },
    );
  }
}
