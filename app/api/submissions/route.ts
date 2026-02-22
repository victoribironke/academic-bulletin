import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/submissions - List submissions with filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const phase = searchParams.get("phase");
    const programmeId = searchParams.get("programmeId");
    const departmentId = searchParams.get("departmentId");
    const schoolId = searchParams.get("schoolId");
    const createdById = searchParams.get("createdById");

    const submissions = await prisma.submission.findMany({
      where: {
        ...(status && {
          status: status as "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED",
        }),
        ...(phase && { currentPhase: parseInt(phase) }),
        ...(programmeId && { programmeId }),
        ...(departmentId && { programme: { departmentId } }),
        ...(schoolId && { programme: { department: { schoolId } } }),
        ...(createdById && { createdById }),
      },
      include: {
        programme: {
          select: {
            id: true,
            name: true,
            code: true,
            department: {
              select: {
                id: true,
                name: true,
                code: true,
                school: {
                  select: { id: true, name: true, code: true },
                },
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: { comments: true, phaseTransitions: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(submissions);
  } catch (error) {
    console.error("Failed to fetch submissions:", error);
    return NextResponse.json(
      { error: "Failed to fetch submissions" },
      { status: 500 },
    );
  }
}

// POST /api/submissions - Create a new submission
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, academicYear, programmeId, createdById } = body;

    if (!title || !academicYear || !programmeId || !createdById) {
      return NextResponse.json(
        { error: "Title, academic year, programme, and creator are required" },
        { status: 400 },
      );
    }

    // Create submission with empty content
    const submission = await prisma.submission.create({
      data: {
        title,
        academicYear,
        programmeId,
        createdById,
        status: "DRAFT",
        currentPhase: 1,
        content: {
          create: {
            sectionA: {},
            sectionB: {},
            sectionC: {},
            sectionD: {},
            sectionE: {},
            sectionF: {},
            sectionG: {},
            sectionH: {},
          },
        },
      },
      include: {
        programme: {
          select: {
            id: true,
            name: true,
            code: true,
            department: {
              select: {
                id: true,
                name: true,
                code: true,
                school: {
                  select: { id: true, name: true, code: true },
                },
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        content: true,
      },
    });

    return NextResponse.json(submission, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to create submission:", error);

    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2002") {
        return NextResponse.json(
          {
            error:
              "A submission for this programme and academic year already exists",
          },
          { status: 409 },
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Programme or user not found" },
          { status: 400 },
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create submission" },
      { status: 500 },
    );
  }
}
