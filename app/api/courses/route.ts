import { NextResponse } from "next/server";
import { carryAdded, carryMessage } from "@/lib/programmes/option-families";
import prisma from "@/lib/prisma";
import { GROUP_RULE_MESSAGE, HOURS_RULE_MESSAGE, readElectiveGroup, readHours } from "@/lib/courses/hours-and-groups";
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
  COURSE_OWNER_SELECT,
  PROGRAMME_PLACE_SELECT,
  descriptionAccess,
  ownerName,
  programmePlace,
  startDescriptionFromRegistry,
  isOwnedElsewhere,
} from "@/lib/courses/shared-courses";
import { isGeneralEducationCourse } from "@/lib/courses/general-education";
import { recordActivity } from "@/lib/activity-log";
import { currentCourseGraceState } from "@/lib/courses/grace-compliance";
import {
  SEMESTER_RULE_MESSAGE,
  UNITS_RULE_MESSAGE,
  isValidCourseUnits,
  parseCourseSemester,
} from "@/lib/courses/course-rules";
import { NO_ACCESS, couldNot } from "@/lib/messages";

// GET /api/courses - Get courses for a submission
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const submissionId = searchParams.get("submissionId");
    const level = searchParams.get("level");

    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 },
      );
    }

    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canReadSubmission(auth.user, submissionId))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }

    // Reading the list never adds courses (G6: a course the department
    // removed used to come back here). Registry courses are added when a
    // draft is created and when the Registry changes.

    const where: Record<string, unknown> = { submissionId };
    if (level) where.level = parseInt(level);

    const courses = await prisma.course.findMany({
      where,
      include: {
        description: {
          select: {
            id: true,
            learningOutcomes: true,
            courseContent: true,
            labWork: true,
            entrepreneurialAspect: true,
            gracePass: true,
            graceResult: true,
            graceStatus: true,
            graceContentHash: true,
            graceCheckedAt: true,
          },
        },
        masterCourse: {
          select: {
            id: true,
            code: true,
            title: true,
            ...COURSE_OWNER_SELECT,
            _count: { select: { programmeLinks: true } },
          },
        },
      },
      orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
    });
    const draft = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { programme: { select: PROGRAMME_PLACE_SELECT } },
    });
    const place = draft ? programmePlace(draft.programme) : null;
    const administrator = isAdministrator(auth.user);

    // Reading the list never queues or runs a GRACE check: a description whose
    // text changed since its last check is shown as waiting, not rewritten.
    return NextResponse.json(
      courses.map((course) => {
        // W1: the General Education block is locked for departments.
        const locked = isGeneralEducationCourse(course);
        // W16: who writes the description of a course several programmes share.
        const access = place
          ? descriptionAccess(course, place, { isAdministrator: administrator })
          : "LOCAL";
        const withFlags = {
          ...course,
          isGeneralEducation: locked,
          isMandatory: locked,
          descriptionAccess: access,
          // W4: taught by another department (a non-departmental credit).
          ownedElsewhere: place ? isOwnedElsewhere(course, place) : false,
          sharedOwner: ownerName(course.masterCourse),
          sharedWithProgrammes: course.masterCourse?._count.programmeLinks ?? 0,
        };
        return course.description
          ? { ...withFlags, description: currentCourseGraceState(course.title, course.description) }
          : withFlags;
      }),
    );
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    return NextResponse.json(
      { error: couldNot("load courses") },
      { status: 500 },
    );
  }
}

// POST /api/courses - Create a new course
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      submissionId,
      code,
      title,
      units,
      status,
      semester,
      level,
      prerequisites,
      masterCourseId,
      lectureHours,
      practicalHours,
      electiveGroupId,
    } = body;

    if (
      !submissionId ||
      !code ||
      !title ||
      units === undefined ||
      !level
    ) {
      return NextResponse.json(
        {
          error: "submissionId, code, title, units and level are required",
        },
        { status: 400 },
      );
    }

    // Validate course code format
    if (!isValidCourseCode(code)) {
      return NextResponse.json(
        {
          error:
            "Invalid course code. Use a format such as COS 101, or BU-COS 101 for a Babcock-specific course.",
        },
        { status: 400 },
      );
    }

    // Format course code and title
    const formattedCode = formatCourseCode(code);
    const formattedTitle = formatCourseTitle(title);

    // Validate level
    const validLevels = [100, 200, 300, 400, 500, 600];
    if (!validLevels.includes(level)) {
      return NextResponse.json(
        { error: "Invalid level. Must be 100, 200, 300, 400, 500, or 600" },
        { status: 400 },
      );
    }

    // Units 0 to 12; semester 1, 2 or none for a sessional course (B13)
    if (!isValidCourseUnits(units)) {
      return NextResponse.json({ error: UNITS_RULE_MESSAGE }, { status: 400 });
    }
    const parsedSemester = parseCourseSemester(semester);
    if (parsedSemester === undefined) {
      return NextResponse.json({ error: SEMESTER_RULE_MESSAGE }, { status: 400 });
    }

    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(user, submissionId);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message },
        { status: gate.status },
      );
    }

    const existingCode = await prisma.course.findUnique({
      where: { code_submissionId: { code: formattedCode, submissionId } },
    });

    if (existingCode) {
      return NextResponse.json(
        { error: "A course with this code already exists in this submission" },
        { status: 409 },
      );
    }

    // Check for duplicate course title in this submission
    const existingTitle = await prisma.course.findFirst({
      where: {
        submissionId,
        title: {
          equals: formattedTitle,
          mode: "insensitive",
        },
      },
    });

    if (existingTitle) {
      return NextResponse.json(
        { error: "A course with this title already exists in this submission" },
        { status: 409 },
      );
    }

    // G6: adding a Registry course back clears its "removed" mark.
    if (masterCourseId) {
      const draft = await prisma.submission.findUnique({
        where: { id: submissionId },
        select: { dismissedRegistryCourseIds: true },
      });
      if (draft?.dismissedRegistryCourseIds.includes(masterCourseId)) {
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            dismissedRegistryCourseIds: draft.dismissedRegistryCourseIds.filter((courseId) => courseId !== masterCourseId),
          },
        });
      }
    }

    // W2: contact hours; W3: the elective group, on this same draft.
    const lecture = readHours(lectureHours);
    const practical = readHours(practicalHours);
    if (!lecture.ok || !practical.ok) {
      return NextResponse.json({ error: HOURS_RULE_MESSAGE }, { status: 400 });
    }
    const group = await readElectiveGroup(electiveGroupId, submissionId);
    if (!group.ok) return NextResponse.json({ error: GROUP_RULE_MESSAGE }, { status: 400 });

    const course = await prisma.course.create({
      data: {
        code: formattedCode,
        title: formattedTitle,
        units,
        status: status || "CORE",
        semester: parsedSemester,
        level,
        submissionId,
        prerequisites: prerequisites || null,
        masterCourseId: masterCourseId || null,
        lectureHours: lecture.value ?? null,
        practicalHours: practical.value ?? null,
        electiveGroupId: group.value ?? null,
      },
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

    // W16: a Registry course starts with the text every programme shares.
    if (course.masterCourseId) {
      await startDescriptionFromRegistry(prisma, {
        id: course.id,
        title: course.title,
        submissionId,
        masterCourseId: course.masterCourseId,
      });
    }
    const description = course.masterCourseId
      ? await prisma.courseDescription.findUnique({ where: { courseId: course.id } })
      : null;

    await recordActivity({
      actorId: user!.id,
      action: "COURSE_CREATED",
      entityType: "SUBMISSION",
      entityId: submissionId,
      description: `Added ${course.code} - ${course.title} to a submission.`,
      metadata: { courseId: course.id, code: course.code },
    });

    // W18: a B.Agric. option's shared levels reach the other options.
    const options = await carryAdded(user!, submissionId, [course]);

    return NextResponse.json({ ...course, description, optionsNote: carryMessage(options) }, { status: 201 });
  } catch (error) {
    console.error("Failed to create course:", error);
    return NextResponse.json(
      { error: couldNot("create course") },
      { status: 500 },
    );
  }
}
