import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string; commentId: string }>;
}

// PATCH /api/submissions/[id]/comments/[commentId] - Update comment (resolve/unresolve)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { commentId } = await params;
    const body = await request.json();
    const { status, content } = body;

    const comment = await prisma.comment.update({
      where: { id: commentId },
      data: {
        ...(status && { status }),
        ...(status === "RESOLVED" && { resolvedAt: new Date() }),
        ...(status === "OPEN" && { resolvedAt: null }),
        ...(content && { content }),
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
    const { commentId } = await params;

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
