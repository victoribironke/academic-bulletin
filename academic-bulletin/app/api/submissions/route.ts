import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

const SUBMISSION_STATUSES = [
  "DRAFT",
  "CORRECTIONS_REQUIRED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;

// GET /api/submissions - List submissions with filters
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (
      (auth.user.role === "HOD" && !auth.user.departmentId) ||
      (auth.user.role === "DEAN" && !auth.user.schoolId)
    ) {
      return NextResponse.json(
        { error: "Your account is not assigned to an academic unit." },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const phase = searchParams.get("phase");
    const programmeId = searchParams.get("programmeId");
    const departmentId =
      auth.user.role === "HOD"
        ? auth.user.departmentId
        : searchParams.get("departmentId");
    const schoolId =
      auth.user.role === "DEAN"
        ? auth.user.schoolId
        : searchParams.get("schoolId");
    const createdById = searchParams.get("createdById");
    const cycleId = searchParams.get("cycleId");

    if (
      status &&
      !SUBMISSION_STATUSES.includes(
        status as (typeof SUBMISSION_STATUSES)[number],
      )
    ) {
      return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
    }
    const phaseNumber = phase ? Number(phase) : null;
    if (
      phaseNumber !== null &&
      (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 11)
    ) {
      return NextResponse.json({ error: "Invalid phase filter." }, { status: 400 });
    }

    const submissions = await prisma.submission.findMany({
      where: {
        ...(status && {
          status: status as
            | "DRAFT"
            | "CORRECTIONS_REQUIRED"
            | "IN_REVIEW"
            | "APPROVED"
            | "REJECTED",
        }),
        ...(phaseNumber !== null && { currentPhase: phaseNumber }),
        ...(programmeId && { programmeId }),
        ...(departmentId && { programme: { departmentId } }),
        ...(schoolId && { programme: { department: { schoolId } } }),
        ...(createdById && { createdById }),
        ...(cycleId && { cycleId }),
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
        cycle: {
          select: { id: true, name: true, isActive: true },
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
    const auth = await requireApiUser(["SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { title, programmeId, cycleId } = body;

    if (!title || !programmeId || !cycleId) {
      return NextResponse.json(
        { error: "Title, programme, and cycle are required" },
        { status: 400 },
      );
    }

    // Create submission with empty content
    const submission = await prisma.submission.create({
      data: {
        title,
        programmeId,
        createdById: auth.user.id,
        cycleId,
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
              "A submission for this programme already exists in this review cycle",
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
