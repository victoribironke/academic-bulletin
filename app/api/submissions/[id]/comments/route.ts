import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/submissions/[id]/comments - Get all comments for a submission
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section");
    const status = searchParams.get("status");

    const comments = await prisma.comment.findMany({
      where: {
        submissionId: id,
        ...(section && { section }),
        ...(status && { status: status as "OPEN" | "RESOLVED" }),
      },
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
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    return NextResponse.json(
      { error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

// POST /api/submissions/[id]/comments - Add a comment
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content, section, type, authorId } = body;

    if (!content || !authorId) {
      return NextResponse.json(
        { error: "Content and authorId are required" },
        { status: 400 }
      );
    }

    // Get current phase of submission
    const submission = await prisma.submission.findUnique({
      where: { id },
      select: { currentPhase: true },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        section,
        type: type || "SUGGESTION",
        phase: submission.currentPhase,
        submissionId: id,
        authorId,
      },
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
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error("Failed to create comment:", error);
    return NextResponse.json(
      { error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
