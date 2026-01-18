import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/submissions/[id] - Get a single submission with all details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const submission = await prisma.submission.findUnique({
      where: { id },
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
            role: true,
          },
        },
        content: true,
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        phaseTransitions: {
          include: {
            performedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
          orderBy: { transitionedAt: "desc" },
        },
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(submission);
  } catch (error) {
    console.error("Failed to fetch submission:", error);
    return NextResponse.json(
      { error: "Failed to fetch submission" },
      { status: 500 },
    );
  }
}

// PUT /api/submissions/[id] - Update submission (content, status)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, content, status } = body;

    // Update submission
    await prisma.submission.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(status && { status }),
        ...(status === "IN_REVIEW" && { submittedAt: new Date() }),
        ...(status === "APPROVED" && { approvedAt: new Date() }),
      },
    });

    // Update content if provided
    if (content) {
      await prisma.submissionContent.update({
        where: { submissionId: id },
        data: {
          ...(content.sectionA !== undefined && { sectionA: content.sectionA }),
          ...(content.sectionB !== undefined && { sectionB: content.sectionB }),
          ...(content.sectionC !== undefined && { sectionC: content.sectionC }),
          ...(content.sectionD !== undefined && { sectionD: content.sectionD }),
          ...(content.sectionE !== undefined && { sectionE: content.sectionE }),
          ...(content.sectionF !== undefined && { sectionF: content.sectionF }),
          ...(content.sectionG !== undefined && { sectionG: content.sectionG }),
          ...(content.sectionH !== undefined && { sectionH: content.sectionH }),
        },
      });
    }

    // Re-fetch with full data
    const updated = await prisma.submission.findUnique({
      where: { id },
      include: {
        programme: {
          select: { id: true, name: true, code: true },
        },
        content: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error("Failed to update submission:", error);

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update submission" },
      { status: 500 },
    );
  }
}

// DELETE /api/submissions/[id] - Delete a submission
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    await prisma.submission.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to delete submission:", error);

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Failed to delete submission" },
      { status: 500 },
    );
  }
}
