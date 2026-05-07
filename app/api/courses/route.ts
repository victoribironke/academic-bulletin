import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  formatCourseTitle,
  formatCourseCode,
  isValidCourseCode,
} from "@/lib/validation/name-format";
import { getApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";

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
          },
        },
        masterCourse: {
          select: {
            id: true,
            code: true,
            title: true,
            type: true,
            ownership: true,
          },
        },
      },
      orderBy: [{ level: "asc" }, { semester: "asc" }, { code: "asc" }],
    });

    return NextResponse.json(courses);
  } catch (error) {
    console.error("Failed to fetch courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
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
    } = body;

    if (
      !submissionId ||
      !code ||
      !title ||
      units === undefined ||
      !semester ||
      !level
    ) {
      return NextResponse.json(
        {
          error:
            "submissionId, code, title, units, semester, and level are required",
        },
        { status: 400 },
      );
    }

    // Validate course code format
    if (!isValidCourseCode(code)) {
      return NextResponse.json(
        {
          error:
            "Invalid course code format. Expected format: AAA 123 (e.g., COS 101)",
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

    // Validate semester
    if (![1, 2].includes(semester)) {
      return NextResponse.json(
        { error: "Invalid semester. Must be 1 or 2" },
        { status: 400 },
      );
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

    const course = await prisma.course.create({
      data: {
        code: formattedCode,
        title: formattedTitle,
        units,
        status: status || "CORE",
        semester,
        level,
        submissionId,
        prerequisites: prerequisites || null,
        masterCourseId: masterCourseId || null,
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

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("Failed to create course:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 },
    );
  }
}
