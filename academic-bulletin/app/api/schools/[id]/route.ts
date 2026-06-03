import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/schools/[id] - Get a single school
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const school = await prisma.school.findUnique({
      where: { id },
      include: {
        departments: {
          include: {
            _count: {
              select: { programmes: true },
            },
          },
        },
        _count: {
          select: { departments: true, users: true },
        },
      },
    });

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    return NextResponse.json(school);
  } catch (error) {
    console.error("Failed to fetch school:", error);
    return NextResponse.json(
      { error: "Failed to fetch school" },
      { status: 500 }
    );
  }
}

// PUT /api/schools/[id] - Update a school
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, code, description } = body;

    const school = await prisma.school.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(code && { code: code.toUpperCase() }),
        ...(description !== undefined && { description }),
      },
    });

    return NextResponse.json(school);
  } catch (error: unknown) {
    console.error("Failed to update school:", error);

    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2025") {
        return NextResponse.json(
          { error: "School not found" },
          { status: 404 }
        );
      }
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "A school with this name or code already exists" },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to update school" },
      { status: 500 }
    );
  }
}

// DELETE /api/schools/[id] - Delete a school
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    await prisma.school.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to delete school:", error);

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Failed to delete school" },
      { status: 500 }
    );
  }
}
