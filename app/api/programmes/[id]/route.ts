import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/programmes/[id] - Get a single programme
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const programme = await prisma.programme.findUnique({
      where: { id },
      include: {
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
        submissions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            currentPhase: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!programme) {
      return NextResponse.json(
        { error: "Programme not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(programme);
  } catch (error) {
    console.error("Failed to fetch programme:", error);
    return NextResponse.json(
      { error: "Failed to fetch programme" },
      { status: 500 },
    );
  }
}

// PUT /api/programmes/[id] - Update a programme
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, code, description, degreeType, duration, departmentId } =
      body;

    const programme = await prisma.programme.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(code && { code: code.toUpperCase() }),
        ...(description !== undefined && { description }),
        ...(degreeType !== undefined && { degreeType }),
        ...(duration !== undefined && {
          duration: duration ? parseInt(duration) : null,
        }),
        ...(departmentId && { departmentId }),
      },
      include: {
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
    });

    return NextResponse.json(programme);
  } catch (error: unknown) {
    console.error("Failed to update programme:", error);

    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2025") {
        return NextResponse.json(
          { error: "Programme not found" },
          { status: 404 },
        );
      }
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "A programme with this code already exists" },
          { status: 409 },
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update programme" },
      { status: 500 },
    );
  }
}

// DELETE /api/programmes/[id] - Delete a programme
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    await prisma.programme.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to delete programme:", error);

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Programme not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Failed to delete programme" },
      { status: 500 },
    );
  }
}
