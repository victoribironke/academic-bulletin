import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { canLecturerEditCourse, lecturerAssignment } from "@/lib/courses/assignments";
import {
  canReadSubmission,
  getApiUser,
  isAdministrator,
  requireApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import {
  COURSE_OWNER_SELECT,
  PROGRAMME_PLACE_SELECT,
  SHARED_COURSE_LOCKED_CODE,
  descriptionAccess,
  programmePlace,
  shareTeachingText,
  sharedCourseLockedMessage,
} from "@/lib/courses/shared-courses";
import { AUTOSAVE_COALESCE_MINUTES, recordActivity } from "@/lib/activity-log";
import {
  normalizeLearningOutcomes,
  prepareCourseGraceState,
} from "@/lib/courses/grace-compliance";
import { NO_ACCESS, couldNot } from "@/lib/messages";

// GET /api/courses/[id]/description - Get course description
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const description = await prisma.courseDescription.findUnique({
      where: { courseId: id },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            units: true,
            submissionId: true,
          },
        },
      },
    });

    if (!description) {
      return NextResponse.json(
        { error: "Course description not found" },
        { status: 404 },
      );
    }

    const auth = await requireApiUser(undefined, { limitedRoles: ["LECTURER", "COMMITTEE_MEMBER"] });
    if (!auth.ok) return auth.response;
    // G2: a lecturer reads only the courses given to them.
    const allowed =
      auth.user.role === "LECTURER"
        ? Boolean(await lecturerAssignment(auth.user.id, id))
        : await canReadSubmission(auth.user, description.course.submissionId);
    if (!allowed) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }

    return NextResponse.json(description);
  } catch (error) {
    console.error("Failed to fetch course description:", error);
    return NextResponse.json(
      { error: couldNot("load course description") },
      { status: 500 },
    );
  }
}

// PUT /api/courses/[id]/description - Create or update course description
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { learningOutcomes, courseContent, labWork, entrepreneurialAspect } =
      body;

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        title: true,
        submissionId: true,
        masterCourseId: true,
        masterCourse: { select: COURSE_OWNER_SELECT },
        submission: { select: { programme: { select: PROGRAMME_PLACE_SELECT } } },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const user = await getApiUser();
    // G2: a lecturer writes a course given to them, while it is with them.
    if (user?.role === "LECTURER") {
      if (!(await canLecturerEditCourse(user.id, course.id))) {
        return NextResponse.json({ error: "This course isn't with you to edit now." }, { status: 403 });
      }
    } else {
      const gate = await requireSubmissionWriteAccess(user, course.submissionId);
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.message },
          { status: gate.status },
        );
      }
    }

    // W16: a shared course's description is written by the department that
    // owns it; W1: General Education by the General Education desk.
    const access = descriptionAccess(course, programmePlace(course.submission.programme), {
      isAdministrator: isAdministrator(user!),
    });
    if (access === "LOCKED") {
      return NextResponse.json(
        { error: sharedCourseLockedMessage(course.masterCourse, course.code), code: SHARED_COURSE_LOCKED_CODE },
        { status: 403 },
      );
    }

    const outcomes = normalizeLearningOutcomes(learningOutcomes);
    const content = typeof courseContent === "string" ? courseContent.trim() : "";
    const lab = typeof labWork === "string" ? labWork.trim() || null : null;
    const entrepreneurial =
      typeof entrepreneurialAspect === "string" ? entrepreneurialAspect.trim() || null : null;
    const description = await prisma.$transaction(async (tx) => {
      const graceState = await prepareCourseGraceState(tx, {
        title: course.title,
        learningOutcomes: outcomes,
        courseContent: content,
      });
      const saved = await tx.courseDescription.upsert({
        where: { courseId: id },
        update: {
          learningOutcomes: outcomes,
          courseContent: content || null,
          labWork: lab,
          entrepreneurialAspect: entrepreneurial,
          ...graceState,
        },
        create: {
          courseId: id,
          submissionId: course.submissionId,
          learningOutcomes: outcomes,
          courseContent: content || null,
          labWork: lab,
          entrepreneurialAspect: entrepreneurial,
          ...graceState,
        },
        include: {
          course: {
            select: { id: true, code: true, title: true },
          },
        },
      });
      // W16: the owner's text is the course's text for every programme.
      const shared =
        access === "OWNER" && course.masterCourseId
          ? await shareTeachingText(tx, {
              masterCourseId: course.masterCourseId,
              sourceCourseId: id,
              actorId: user!.id,
              text: {
                learningOutcomes: outcomes,
                courseContent: content || null,
                labWork: lab,
                entrepreneurialAspect: entrepreneurial,
              },
            })
          : null;
      await recordActivity(
        {
          actorId: user!.id,
          action: "COURSE_DETAILS_UPDATED",
          entityType: "SUBMISSION",
          entityId: course.submissionId,
          description: `Updated the learning outcomes and course content for ${saved.course.code}.`,
          metadata: {
            courseId: id,
            graceStatus: saved.graceStatus,
            ...(shared && { sharedWithDraftRows: shared.draftRowsUpdated }),
          },
          coalesceWithinMinutes: AUTOSAVE_COALESCE_MINUTES,
        },
        tx,
      );
      return { ...saved, sharedWith: shared?.programmes ?? [] };
    }, { timeout: 30_000 });

    return NextResponse.json(description);
  } catch (error) {
    console.error("Failed to update course description:", error);
    return NextResponse.json(
      { error: couldNot("update course description") },
      { status: 500 },
    );
  }
}
