import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  formatCourseTitle,
  formatCourseCode,
  isValidCourseCode,
} from "@/lib/validation/name-format";
import { requireApiUser } from "@/lib/api-auth";

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
const VALID_LEVELS = [100, 200, 300, 400, 500];
const VALID_SEMESTERS = [1, 2];

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

    if (auth.user.role === "HOD") {
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
      const semNum = parseInt(semester);
      if (VALID_SEMESTERS.includes(semNum)) where.semester = semNum;
    }

    const courses = await prisma.masterCourse.findMany({
      where,
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
      orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
    });

    return NextResponse.json(courses);
  } catch (error) {
    console.error("Failed to fetch master courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
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
      ownerDeptId,
      ownerSchoolId,
      prerequisiteIds,
    } = body;

    // Required field validation
    if (!code || !title || !units || !level || !semester) {
      return NextResponse.json(
        { error: "Code, title, units, level, and semester are required" },
        { status: 400 },
      );
    }

    // Course code validation
    if (!isValidCourseCode(code)) {
      return NextResponse.json(
        {
          error:
            "Invalid course code format. Expected format: AAA 123 (e.g., COS 101)",
        },
        { status: 400 },
      );
    }

    // Check for duplicate course code
    const existing = await prisma.masterCourse.findUnique({
      where: { code: formatCourseCode(code) },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Course with code ${formatCourseCode(code)} already exists` },
        { status: 409 },
      );
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
    if (!VALID_SEMESTERS.includes(semester)) {
      return NextResponse.json(
        { error: "Invalid semester. Must be 1 or 2" },
        { status: 400 },
      );
    }

    // Units validation
    if (typeof units !== "number" || units < 1 || units > 6) {
      return NextResponse.json(
        { error: "Units must be a number between 1 and 6" },
        { status: 400 },
      );
    }

    // Ownership validation based on type
    const resolvedOwnership = ownership || "DEPARTMENT";
    const finalDeptId =
      resolvedOwnership === "INSTITUTIONAL" ? null : ownerDeptId;
    const finalSchoolId =
      resolvedOwnership === "INSTITUTIONAL" ? null : ownerSchoolId;

    if (resolvedOwnership === "DEPARTMENT" && !finalDeptId) {
      return NextResponse.json(
        { error: "ownerDeptId is required for department-owned courses" },
        { status: 400 },
      );
    }
    // For INSTITUTIONAL, we force ownerDeptId to null
    // For INSTITUTIONAL, we force ownerDeptId to null
    // For INSTITUTIONAL, we force ownerDeptId to null

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
        title: formatCourseTitle(title),
        units,
        type: type || "CORE",
        ownership: resolvedOwnership,
        level,
        semester,
        description: description || null,
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

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("Failed to create master course:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 },
    );
  }
}
