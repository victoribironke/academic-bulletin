import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canViewSubmission,
  isAdministrator,
  requireApiUser,
} from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ id: string; commentId: string }>;
}

// PATCH /api/submissions/[id]/comments/[commentId] - Update comment (resolve/unresolve)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, commentId } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { status, content } = body;

    if (status !== undefined && !["OPEN", "RESOLVED"].includes(status)) {
      return NextResponse.json({ error: "Invalid comment status." }, { status: 400 });
    }
    if (content !== undefined && !content?.trim()) {
      return NextResponse.json({ error: "Content is required." }, { status: 400 });
    }

    const existing = await prisma.comment.findFirst({
      where: { id: commentId, submissionId: id },
      select: { authorId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (
      content !== undefined &&
      existing.authorId !== auth.user.id &&
      !isAdministrator(auth.user)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const comment = await prisma.comment.update({
      where: { id: commentId },
      data: {
        ...(status && { status }),
        ...(status === "RESOLVED" && { resolvedAt: new Date() }),
        ...(status === "OPEN" && { resolvedAt: null }),
        ...(content && { content: content.trim() }),
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

    return NextResponse.json(comment);
  } catch (error: unknown) {
    console.error("Failed to update comment:", error);

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to update comment" },
      { status: 500 }
    );
  }
}

// DELETE /api/submissions/[id]/comments/[commentId] - Delete a comment
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id, commentId } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.comment.findFirst({
      where: { id: commentId, submissionId: id },
      select: { authorId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (
      existing.authorId !== auth.user.id &&
      !isAdministrator(auth.user)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to delete comment:", error);

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to delete comment" },
      { status: 500 }
    );
  }
}
