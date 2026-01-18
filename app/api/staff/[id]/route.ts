import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/staff/[id] - Get single staff member
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const staff = await prisma.staff.findUnique({
      where: { id },
      include: {
        department: {
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
        courses: {
          select: {
            id: true,
            code: true,
            title: true,
            level: true,
            semester: true,
            units: true,
          },
        },
      },
    });

    if (!staff) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    return NextResponse.json(staff);
  } catch (error) {
    console.error("Failed to fetch staff:", error);
    return NextResponse.json(
      { error: "Failed to fetch staff" },
      { status: 500 },
    );
  }
}

// PATCH /api/staff/[id] - Update staff member
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, position, specialization, email, type, isActive } = body;

    // Check if staff exists
    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (position !== undefined) updateData.position = position;
    if (specialization !== undefined)
      updateData.specialization = specialization;
    if (email !== undefined) updateData.email = email;
    if (type !== undefined) {
      const validTypes = ["ACADEMIC", "ADJUNCT", "NON_ACADEMIC"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: "Invalid staff type" },
          { status: 400 },
        );
      }
      updateData.type = type;
    }
    if (isActive !== undefined) updateData.isActive = isActive;

    const staff = await prisma.staff.update({
      where: { id },
      data: updateData,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    return NextResponse.json(staff);
  } catch (error) {
    console.error("Failed to update staff:", error);
    return NextResponse.json(
      { error: "Failed to update staff" },
      { status: 500 },
    );
  }
}

// DELETE /api/staff/[id] - Delete staff member
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Check if staff exists
    const existing = await prisma.staff.findUnique({
      where: { id },
      include: { _count: { select: { courses: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // Don't allow deletion if staff is assigned to courses
    if (existing._count.courses > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot delete staff member assigned to courses. Remove course assignments first or deactivate instead.",
        },
        { status: 400 },
      );
    }

    await prisma.staff.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete staff:", error);
    return NextResponse.json(
      { error: "Failed to delete staff" },
      { status: 500 },
    );
  }
}
