import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { canWriteOwnedCourse } from "@/lib/courses/courses-we-own";
import { courseGraceContentHash, prepareCourseGraceState, processGraceAssessment } from "@/lib/courses/grace-compliance";
import { aiRateLimitResponse } from "@/lib/rate-limit";
import { couldNot } from "@/lib/messages";

type RouteParams = { params: Promise<{ id: string }> };

const loadCourse = (id: string) =>
  prisma.masterCourse.findUnique({
    where: { id },
    select: { id: true, code: true, title: true, learningOutcomes: true, courseContent: true, ownerDeptId: true, ownerSchoolId: true },
  });

const summary = (assessment: { status: string; result: unknown; error: string | null; checkedAt: Date | null } | null) => {
  if (!assessment) return { status: "NOT_CHECKED" as const };
  const result = (assessment.result ?? {}) as { explanation?: string; recommendation?: string };
  return {
    status: assessment.status,
    explanation: result.explanation ?? null,
    recommendation: result.recommendation ?? null,
    error: assessment.error,
    checkedAt: assessment.checkedAt?.toISOString() ?? null,
  };
};

/**
 * GET /api/courses-we-own/[id]/grace - The GRACE result for the course's
 * shared text, if it has been checked (D9 and B6). Changes nothing.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const course = await loadCourse((await params).id);
    if (!course) return NextResponse.json({ error: "That course isn't in the Registry." }, { status: 404 });
    const hash = courseGraceContentHash({ title: course.title, courseContent: course.courseContent, learningOutcomes: course.learningOutcomes });
    if (!hash) return NextResponse.json({ status: "NO_TEXT" });
    return NextResponse.json(summary(await prisma.graceAssessment.findUnique({ where: { contentHash: hash } })));
  } catch (error) {
    console.error("Failed to load the GRACE result:", error);
    return NextResponse.json({ error: couldNot("load the GRACE result") }, { status: 500 });
  }
}

/**
 * POST /api/courses-we-own/[id]/grace - Run the GRACE check on the course's
 * shared text: the General Education desk (DAP, DEC8) for GST, BU-GST and
 * ENT, or the owning department. One result serves every draft with the
 * same text.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    const course = await loadCourse((await params).id);
    if (!course) return NextResponse.json({ error: "That course isn't in the Registry." }, { status: 404 });
    if (!(await canWriteOwnedCourse(auth.user, course))) {
      return NextResponse.json(
        { error: `Only the department that owns ${course.code}, or DAP, can run its GRACE check here.` },
        { status: 403 },
      );
    }
    if (!course.courseContent?.trim()) {
      return NextResponse.json({ error: "Save the course content first; GRACE checks the saved text." }, { status: 400 });
    }
    const limited = await aiRateLimitResponse("graceCheck", auth.user.id);
    if (limited) return limited;
    const state = await prepareCourseGraceState(prisma, {
      title: course.title,
      courseContent: course.courseContent,
      learningOutcomes: course.learningOutcomes,
    });
    if (!state.graceContentHash) return NextResponse.json({ status: "NO_TEXT" });
    const assessment = await processGraceAssessment(state.graceContentHash, { retry: state.graceStatus === "ERROR" });
    return NextResponse.json(summary(assessment));
  } catch (error) {
    console.error("GRACE check on a Registry course failed:", error);
    return NextResponse.json({ error: couldNot("run the GRACE check") }, { status: 500 });
  }
}
