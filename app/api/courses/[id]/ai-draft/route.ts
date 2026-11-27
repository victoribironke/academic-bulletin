import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getApiUser, isAdministrator, requireSubmissionWriteAccess } from "@/lib/api-auth";
import { aiRateLimitResponse } from "@/lib/rate-limit";
import { AI_DRAFT_LABEL, draftCourseDescription } from "@/lib/assistant";
import { canLecturerEditCourse } from "@/lib/courses/assignments";
import { COURSE_OWNER_SELECT, PROGRAMME_PLACE_SELECT, descriptionAccess, programmePlace, sharedCourseLockedMessage } from "@/lib/courses/shared-courses";
import { NOT_SIGNED_IN, couldNot } from "@/lib/messages";

/**
 * Task B11: POST /api/courses/[id]/ai-draft - a first draft of the course's
 * learning outcomes and content, from the national curriculum text where
 * there is one, marked "AI draft: please check and edit". Nothing is saved;
 * whoever may edit the description decides what to keep.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        title: true,
        units: true,
        level: true,
        submissionId: true,
        masterCourse: { select: { ...COURSE_OWNER_SELECT, courseContent: true, learningOutcomes: true, curriculumSource: true } },
        submission: { select: { programme: { select: { name: true, ...PROGRAMME_PLACE_SELECT } } } },
      },
    });
    if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

    const user = await getApiUser();
    if (!user) return NextResponse.json({ error: NOT_SIGNED_IN }, { status: 401 });
    if (user.role === "LECTURER") {
      if (!(await canLecturerEditCourse(user.id, course.id))) {
        return NextResponse.json({ error: "This course isn't with you to edit now." }, { status: 403 });
      }
    } else {
      const gate = await requireSubmissionWriteAccess(user, course.submissionId);
      if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });
    }
    const access = descriptionAccess(course, programmePlace(course.submission.programme), { isAdministrator: isAdministrator(user) });
    if (access === "LOCKED") {
      return NextResponse.json({ error: sharedCourseLockedMessage(course.masterCourse, course.code) }, { status: 403 });
    }

    const limited = await aiRateLimitResponse("assistant", user.id);
    if (limited) return limited;

    const nationalOutcomes = Array.isArray(course.masterCourse?.learningOutcomes)
      ? (course.masterCourse!.learningOutcomes as unknown[]).map(String).filter((item) => item.trim())
      : [];
    const nationalContent = course.masterCourse?.courseContent?.trim() ?? "";
    const national = nationalContent || nationalOutcomes.length
      ? { source: course.masterCourse?.curriculumSource ?? null, content: nationalContent, outcomes: nationalOutcomes }
      : null;
    const draft = await draftCourseDescription({
      code: course.code,
      title: course.title,
      units: course.units,
      level: course.level,
      programme: course.submission.programme.name,
      national,
    });
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 503 });
    return NextResponse.json({
      label: AI_DRAFT_LABEL,
      source: national?.source ?? null,
      learningOutcomes: draft.learningOutcomes,
      courseContent: draft.courseContent,
    });
  } catch (error) {
    console.error("The AI first draft failed:", error);
    return NextResponse.json({ error: couldNot("draft the description") }, { status: 500 });
  }
}
