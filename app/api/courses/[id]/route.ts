import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  SEMESTER_RULE_MESSAGE,
  UNITS_RULE_MESSAGE,
  isValidCourseUnits,
  parseCourseSemester,
} from "@/lib/courses/course-rules";
import {
  formatCourseTitle,
  formatCourseCode,
  isValidCourseCode,
} from "@/lib/validation/name-format";
import {
  canReadSubmission,
  getApiUser,
  isAdministrator,
  requireApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import {
  GENERAL_EDUCATION_LOCKED_MESSAGE,
  isGeneralEducationCourse,
} from "@/lib/courses/general-education";
import { AUTOSAVE_COALESCE_MINUTES, recordActivity } from "@/lib/activity-log";
import { synchronizeCourseGraceAssessment } from "@/lib/courses/grace-compliance";
import { readDeleteBody, requireDeleteConfirmation, requireDeleteReason } from "@/lib/archive";
import { applyCourseRowDelete, planCourseRowDelete } from "@/lib/courses/delete-course-rows";
import { cleanDeleteReason } from "@/lib/delete-reason";
import {
  COURSE_OWNER_SELECT,
  PROGRAMME_PLACE_SELECT,
  SHARED_COURSE_LOCKED_CODE,
  descriptionAccess,
  programmePlace,
  sharedCourseLockedMessage,
} from "@/lib/courses/shared-courses";

// GET /api/courses/[id] - Get single course with description
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        description: true,
        masterCourse: {
          select: {
            id: true,
            code: true,
            title: true,
            type: true,
            ownership: true,
          },
        },
        submission: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canReadSubmission(auth.user, course.submission.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(course);
  } catch (error) {
    console.error("Failed to fetch course:", error);
    return NextResponse.json(
      { error: "Failed to fetch course" },
      { status: 500 },
    );
  }
}

// PATCH /api/courses/[id] - Update course
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      code,
      title,
      units,
      status,
      semester,
      level,
      prerequisites,
      masterCourseId,
    } = body;

    // Check if course exists
    const existing = await prisma.course.findUnique({
      where: { id },
      include: {
        masterCourse: { select: COURSE_OWNER_SELECT },
        submission: { select: { programme: { select: PROGRAMME_PLACE_SELECT } } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(
      user,
      existing.submissionId,
    );
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message },
        { status: gate.status },
      );
    }

    // W1: a General Education row is the General Education desk's. A save
    // that changes nothing is fine; any change from a department is refused.
    if (isGeneralEducationCourse(existing) && !isAdministrator(user!)) {
      const asked = { code, title, units, status, semester, level, prerequisites };
      const current = {
        code: existing.code,
        title: existing.title,
        units: existing.units,
        status: existing.status,
        semester: existing.semester,
        level: existing.level,
        prerequisites: existing.prerequisites ?? "",
      };
      const changes = (Object.keys(asked) as (keyof typeof asked)[]).filter((key) => {
        const value = asked[key];
        if (value === undefined) return false;
        if (key === "semester") return parseCourseSemester(value) !== current.semester;
        if (key === "code") return formatCourseCode(String(value)) !== current.code;
        if (key === "prerequisites") return (value ?? "") !== current.prerequisites;
        return value !== current[key];
      });
      if (changes.length > 0) {
        return NextResponse.json(
          { error: GENERAL_EDUCATION_LOCKED_MESSAGE, code: "GENERAL_EDUCATION_LOCKED" },
          { status: 403 },
        );
      }
      return NextResponse.json(existing);
    }

    // W16: a shared course's code and title belong to the department that
    // owns it (and the Registry). The table sends every row on save, so only
    // a real change is refused.
    if (
      !isAdministrator(user!) &&
      descriptionAccess(existing, programmePlace(existing.submission.programme)) === "LOCKED"
    ) {
      const renamed =
        (code !== undefined && formatCourseCode(String(code)) !== existing.code) ||
        (title !== undefined && formatCourseTitle(String(title)) !== formatCourseTitle(existing.title));
      if (renamed) {
        return NextResponse.json(
          { error: sharedCourseLockedMessage(existing.masterCourse, existing.code), code: SHARED_COURSE_LOCKED_CODE },
          { status: 403 },
        );
      }
    }

    // Validate course code if provided
    if (code !== undefined && !isValidCourseCode(code)) {
      return NextResponse.json(
        {
          error:
            "Invalid course code. Use a format such as COS 101, or BU-COS 101 for a Babcock-specific course.",
        },
        { status: 400 },
      );
    }

    // Build update data with formatting
    const updateData: Record<string, unknown> = {};
    if (code !== undefined) updateData.code = formatCourseCode(code);
    if (title !== undefined) updateData.title = formatCourseTitle(title);
    if (units !== undefined) {
      if (!isValidCourseUnits(units)) {
        return NextResponse.json({ error: UNITS_RULE_MESSAGE }, { status: 400 });
      }
      updateData.units = units;
    }
    if (status !== undefined) updateData.status = status;
    if (semester !== undefined) {
      // 1, 2, or null for a sessional course with no semester (B13)
      const parsedSemester = parseCourseSemester(semester);
      if (parsedSemester === undefined) {
        return NextResponse.json({ error: SEMESTER_RULE_MESSAGE }, { status: 400 });
      }
      updateData.semester = parsedSemester;
    }
    if (level !== undefined) updateData.level = level;
    if (prerequisites !== undefined)
      updateData.prerequisites = prerequisites || null;
    if (masterCourseId !== undefined)
      updateData.masterCourseId = masterCourseId || null;

    const course = await prisma.course.update({
      where: { id },
      data: updateData,
      include: {
        description: true,
        masterCourse: {
          select: {
            id: true,
            code: true,
            title: true,
          },
        },
      },
    });

    if (title !== undefined && course.description) {
      await synchronizeCourseGraceAssessment(course.id);
    }

    await recordActivity({
      actorId: user!.id,
      action: "COURSE_UPDATED",
      entityType: "SUBMISSION",
      entityId: existing.submissionId,
      description: `Updated ${course.code} - ${course.title}.`,
      metadata: { courseId: id, fields: Object.keys(updateData) },
      // Autosave fires every few seconds; log one entry per editing session.
      coalesceWithinMinutes: AUTOSAVE_COALESCE_MINUTES,
    });

    return NextResponse.json(course);
  } catch (error) {
    console.error("Failed to update course:", error);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 },
    );
  }
}

// DELETE /api/courses/[id] - Delete one course row. It goes to the Archive
// with its description and can be restored (Q7). Several rows at once go
// through DELETE /api/courses/bulk.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await readDeleteBody(request.clone());

    const user = await getApiUser();
    const planned = await planCourseRowDelete(user, [id]);
    if (!planned.ok) return planned.response;

    // Q7: the person typed DELETE (the course table asks when a saved row is removed).
    const unconfirmed = await requireDeleteConfirmation(request, "course row");
    if (unconfirmed) return unconfirmed;
    // Appendix D: deleting another unit's row also needs a reason.
    const unexplained = requireDeleteReason(planned.plan.needsReason, body.reason);
    if (unexplained) return unexplained;

    await applyCourseRowDelete(planned.plan, user!.id, cleanDeleteReason(body.reason));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete course:", error);
    return NextResponse.json(
      { error: "Failed to delete course" },
      { status: 500 },
    );
  }
}
