import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { canWriteOwnedCourse } from "@/lib/courses/courses-we-own";
import { normalizeLearningOutcomes } from "@/lib/courses/grace-compliance";
import { shareTeachingText } from "@/lib/courses/shared-courses";

const text = (value: unknown) => (typeof value === "string" ? value.trim() || null : null);

// PUT /api/courses-we-own/[id] - B6 with W16: the owner writes a course's
// learning outcomes and content once, for every programme that uses it.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const course = await prisma.masterCourse.findUnique({
      where: { id },
      select: { id: true, code: true, ownerDeptId: true, ownerSchoolId: true },
    });
    if (!course) return NextResponse.json({ error: "Course not found." }, { status: 404 });
    if (!(await canWriteOwnedCourse(auth.user, course))) {
      return NextResponse.json(
        { error: `Only the department that owns ${course.code}, or DAP, can change its description.` },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    // One outcome per line (W15), from a list or from a block of text.
    const outcomes = normalizeLearningOutcomes(
      typeof body.learningOutcomes === "string" ? body.learningOutcomes.split(/\r?\n/) : body.learningOutcomes,
    );
    const result = await prisma.$transaction(
      (tx) =>
        shareTeachingText(tx, {
          masterCourseId: course.id,
          actorId: auth.user.id,
          text: {
            learningOutcomes: outcomes,
            courseContent: text(body.courseContent),
            labWork: text(body.labWork),
            entrepreneurialAspect: text(body.entrepreneurialAspect),
          },
        }),
      { timeout: 30_000 },
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to save the course description:", error);
    return NextResponse.json({ error: "Couldn't save the description." }, { status: 500 });
  }
}
