import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  SEMESTER_RULE_MESSAGE,
  UNITS_RULE_MESSAGE,
  isValidCourseUnits,
  parseCourseSemester,
} from "@/lib/courses/course-rules";
import {
  cleanCourseTitle,
  formatCourseCode,
  isValidCourseCode,
} from "@/lib/validation/name-format";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { findSameCodeCourse, sameCodeMessage } from "@/lib/courses/code-key";
import { pageResult, parsePagination } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";
import { couldNot } from "@/lib/messages";

// Valid enum values
const VALID_COURSE_TYPES = [
  "GENERAL",
  "CORE",
  "ELECTIVE",
  "REQUIRED",
  "GST_NUC",
  "GST_BU",
];
const VALID_OWNERSHIP = ["DEPARTMENT", "SCHOOL", "INSTITUTIONAL"];
const VALID_LEVELS = [100, 200, 300, 400, 500, 600];

/**
 * B5: a course Babcock offers is linked to a Babcock programme or has a
 * Babcock (BU-) code; the rest are reference courses from the national
 * curriculum only.
 */
const OFFERED_COURSE: Prisma.MasterCourseWhereInput = {
  OR: [{ programmeLinks: { some: {} } }, { code: { startsWith: "BU-" } }],
};
/** The course as one programme runs it (B14): its own units, semester and level where it has them. */
function withProgrammeValues<
  T extends {
    units: number;
    semester: number | null;
    level: number;
    programmeLinks: { unitsOverride: number | null; semesterOverride: number | null; levelOverride: number | null; programme: { id: string } }[];
  },
>(course: T, programmeId: string | null): T & { programmeValues?: boolean } {
  const own = programmeId ? course.programmeLinks.find((link) => link.programme.id === programmeId) : undefined;
  if (!own || (own.unitsOverride === null && own.semesterOverride === null && own.levelOverride === null)) return course;
  return {
    ...course,
    units: own.unitsOverride ?? course.units,
    semester: own.semesterOverride ?? course.semester,
    level: own.levelOverride ?? course.level,
    programmeValues: true,
  };
}

const isOffered = (course: { code: string; _count?: { programmeLinks: number } }) =>
  course.code.startsWith("BU-") || (course._count?.programmeLinks ?? 0) > 0;

// GET /api/master-courses - Get all master courses with filters
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    let departmentId = searchParams.get("departmentId");
    let schoolId = searchParams.get("schoolId");
    const type = searchParams.get("type");
    const ownership = searchParams.get("ownership");
    const level = searchParams.get("level");
    const semester = searchParams.get("semester");
    const discoverable = searchParams.get("discoverable");
    // B5: "only" lists courses Babcock offers (linked to a programme, or a
    // BU- code); "first" lists the national curriculum too, Babcock first.
    const offered = searchParams.get("offered");
    // K0: the search term, under any of the names callers use.
    const query = (searchParams.get("q") ?? searchParams.get("search") ?? searchParams.get("query"))?.trim();
    // `page` asks for one page of full rows; `fields=summary` asks for every
    // course with only the fields the course-code picker needs.
    const paginated = searchParams.has("page");
    const summaryOnly = searchParams.get("fields") === "summary";
    // B14: with a draft, each course comes with that programme's own units,
    // semester and level where they differ from the Registry's.
    const forSubmission = searchParams.get("submissionId");
    const forProgrammeId = forSubmission
      ? ((await prisma.submission.findUnique({ where: { id: forSubmission }, select: { programmeId: true } }))
          ?.programmeId ?? null)
      : null;

    if (["HOD", "PROGRAMME_COORDINATOR"].includes(auth.user.role)) {
      if (!auth.user.departmentId) {
        return NextResponse.json(
          { error: "Your account is not assigned to a department." },
          { status: 403 },
        );
      }
      departmentId = auth.user.departmentId;
      schoolId = null;
    } else if (auth.user.role === "DEAN") {
      if (!auth.user.schoolId) {
        return NextResponse.json(
          { error: "Your account is not assigned to a school." },
          { status: 403 },
        );
      }
      departmentId = null;
      schoolId = auth.user.schoolId;
    }

    const where: Record<string, unknown> = {};

    // When the import dialog requests only discoverable courses, filter accordingly
    if (discoverable === "true") where.discoverable = true;

    if (departmentId || schoolId) {
      const OR: Array<Record<string, unknown>> = [];

      if (departmentId) {
        OR.push({ ownerDeptId: departmentId });
      }
      if (schoolId) {
        OR.push({ ownerSchoolId: schoolId });
      }
      OR.push({ ownership: "INSTITUTIONAL" });
      OR.push({ type: "GENERAL" });

      if (departmentId && !schoolId) {
        const dept = await prisma.department.findUnique({
          where: { id: departmentId },
          select: { schoolId: true },
        });
        if (dept?.schoolId) {
          OR.push({ ownerSchoolId: dept.schoolId });
        }
      }

      where.OR = OR;
    }

    if (type && VALID_COURSE_TYPES.includes(type)) where.type = type;

    // Explicit ownership filter overrides the composite logic above if provided
    if (ownership && VALID_OWNERSHIP.includes(ownership))
      where.ownership = ownership;

    if (level) {
      const levelNum = parseInt(level);
      if (VALID_LEVELS.includes(levelNum)) where.level = levelNum;
    }
    if (semester) {
      // "1", "2", or "sessional" for courses with no semester (B13)
      const semNum = parseCourseSemester(semester);
      if (semNum !== undefined) where.semester = semNum;
    }

    if (query) {
      // "gst112" and "BU-GST112" find "GST 112" and "BU-GST 112" too.
      const tidyCode = formatCourseCode(query);
      const search: Prisma.MasterCourseWhereInput = {
        OR: [
          { code: { contains: query, mode: "insensitive" } },
          ...(tidyCode && tidyCode !== query ? [{ code: { contains: tidyCode, mode: "insensitive" as const } }] : []),
          { title: { contains: query, mode: "insensitive" } },
        ],
      };
      where.AND = [search];
    }
    if (offered === "only") {
      where.AND = [...((where.AND as Prisma.MasterCourseWhereInput[] | undefined) ?? []), OFFERED_COURSE];
    }

    const orderBy: Prisma.MasterCourseOrderByWithRelationInput[] = [
      ...(offered === "first" ? [{ programmeLinks: { _count: "desc" as const } }] : []),
      { level: "asc" },
      { semester: "asc" },
      { code: "asc" },
    ];

    if (summaryOnly) {
      const courses = await prisma.masterCourse.findMany({
        where,
        select: {
          id: true,
          code: true,
          title: true,
          units: true,
          type: true,
          level: true,
          semester: true,
        },
        orderBy,
      });
      return NextResponse.json(courses);
    }

    const { page, pageSize, skip, take } = parsePagination(searchParams);

    const courses = await prisma.masterCourse.findMany({
      where,
      ...(paginated && { skip, take }),
      include: {
        ownerDepartment: {
          select: {
            id: true,
            name: true,
            code: true,
            school: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        ownerSchool: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        programmeLinks: {
          select: {
            id: true,
            isCore: true,
            unitsOverride: true,
            semesterOverride: true,
            levelOverride: true,
            programme: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        prerequisites: {
          select: {
            id: true,
            code: true,
            title: true,
          },
        },
        _count: {
          select: {
            programmeLinks: true,
            submissionCourses: true,
          },
        },
      },
      orderBy,
    });

    if (paginated) {
      const total = await prisma.masterCourse.count({ where });
      return NextResponse.json(
        pageResult(
          courses.map((course) => ({ ...withProgrammeValues(course, forProgrammeId), offered: isOffered(course) })),
          total,
          page,
          pageSize,
        ),
      );
    }
    return NextResponse.json(courses.map((course) => withProgrammeValues(course, forProgrammeId)));
  } catch (error) {
    console.error("Failed to fetch master courses:", error);
    return NextResponse.json(
      { error: couldNot("load courses") },
      { status: 500 },
    );
  }
}

// POST /api/master-courses - Create a new master course (Admin only)
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const {
      code,
      title,
      units,
      type,
      ownership,
      level,
      semester,
      description,
      learningOutcomes,
      courseContent,
      labWork,
      entrepreneurialAspect,
      ownerDeptId,
      ownerSchoolId,
      prerequisiteIds,
    } = body;

    // Required field validation
    if (!code || !title || units === undefined || units === null || !level) {
      return NextResponse.json(
        { error: "Code, title, units and level are required" },
        { status: 400 },
      );
    }

    // Course code validation
    if (!isValidCourseCode(code)) {
      return NextResponse.json(
        {
          error:
            "Invalid course code. Use a format such as COS 101, or BU-COS 101 for a Babcock-specific course.",
        },
        { status: 400 },
      );
    }

    // One code, one course, however it is spaced (B3): "BIO102" is "BIO 102".
    const existing = await findSameCodeCourse(code);
    if (existing) {
      return NextResponse.json({ error: sameCodeMessage(existing) }, { status: 409 });
    }

    // Enum validation
    if (type && !VALID_COURSE_TYPES.includes(type)) {
      return NextResponse.json(
        {
          error: `Invalid type. Must be one of: ${VALID_COURSE_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (ownership && !VALID_OWNERSHIP.includes(ownership)) {
      return NextResponse.json(
        {
          error: `Invalid ownership. Must be one of: ${VALID_OWNERSHIP.join(", ")}`,
        },
        { status: 400 },
      );
    }
    if (!VALID_LEVELS.includes(level)) {
      return NextResponse.json(
        { error: `Invalid level. Must be one of: ${VALID_LEVELS.join(", ")}` },
        { status: 400 },
      );
    }
    // Semester 1, 2 or none (sessional); units 0 to 12 (B13)
    const parsedSemester = parseCourseSemester(semester);
    if (parsedSemester === undefined) {
      return NextResponse.json({ error: SEMESTER_RULE_MESSAGE }, { status: 400 });
    }
    if (!isValidCourseUnits(units)) {
      return NextResponse.json({ error: UNITS_RULE_MESSAGE }, { status: 400 });
    }

    // Ownership validation based on type
    const resolvedOwnership = ownership || "DEPARTMENT";
    // University-wide GST courses may retain a hosting department. They are
    // still available to every programme, while the host HoD can maintain the
    // shared learning details.
    const finalDeptId = ownerDeptId || null;
    const finalSchoolId =
      resolvedOwnership === "INSTITUTIONAL" ? null : ownerSchoolId;

    if (resolvedOwnership === "DEPARTMENT" && !finalDeptId) {
      return NextResponse.json(
        { error: "ownerDeptId is required for department-owned courses" },
        { status: 400 },
      );
    }
    if (resolvedOwnership === "SCHOOL" && !finalSchoolId) {
      // Try to resolve school from dept if missing
      if (finalDeptId) {
        const dept = await prisma.department.findUnique({
          where: { id: finalDeptId },
        });
        if (!dept?.schoolId) {
          return NextResponse.json(
            { error: "ownerSchoolId is required for school-owned courses" },
            { status: 400 },
          );
        }
        // Use the resolved school id if available
      } else {
        return NextResponse.json(
          { error: "ownerSchoolId is required for school-owned courses" },
          { status: 400 },
        );
      }
    }

    // Validate prerequisites exist
    if (
      prerequisiteIds &&
      Array.isArray(prerequisiteIds) &&
      prerequisiteIds.length > 0
    ) {
      const prereqs = await prisma.masterCourse.findMany({
        where: { id: { in: prerequisiteIds } },
        select: { id: true },
      });
      if (prereqs.length !== prerequisiteIds.length) {
        return NextResponse.json(
          { error: "One or more prerequisite courses not found" },
          { status: 400 },
        );
      }
    }

    const course = await prisma.masterCourse.create({
      data: {
        code: formatCourseCode(code),
        title: cleanCourseTitle(title, code),
        units,
        type: type || "CORE",
        ownership: resolvedOwnership,
        level,
        semester: parsedSemester,
        description: description || null,
        learningOutcomes: Array.isArray(learningOutcomes)
          ? learningOutcomes
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
        courseContent: courseContent || description || null,
        labWork: labWork || null,
        entrepreneurialAspect: entrepreneurialAspect || null,
        ownerDeptId: finalDeptId || null,
        ownerSchoolId: finalSchoolId || null,
        prerequisites: prerequisiteIds?.length
          ? { connect: prerequisiteIds.map((id: string) => ({ id })) }
          : undefined,
      },
      include: {
        ownerDepartment: {
          select: {
            id: true,
            name: true,
            code: true,
            school: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        ownerSchool: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        prerequisites: {
          select: {
            id: true,
            code: true,
            title: true,
          },
        },
      },
    });

    await recordActivity({
      actorId: auth.user.id,
      action: "REGISTRY_COURSE_CREATED",
      entityType: "MASTER_COURSE",
      entityId: course.id,
      description: `Created Registry course ${course.code} - ${course.title}.`,
      metadata: { type: course.type, ownership: course.ownership },
    });

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("Failed to create master course:", error);
    return NextResponse.json(
      { error: couldNot("create course") },
      { status: 500 },
    );
  }
}
