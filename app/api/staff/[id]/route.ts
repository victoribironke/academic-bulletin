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
    const {
      title,
      gender,
      surname,
      middleName,
      firstName,
      highestQualification,
      academicRank,
      specialization,
      email,
      type,
      isActive,
    } = body;

    // Check if staff exists
    const existing = await prisma.staff.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (gender !== undefined) updateData.gender = gender;
    if (surname !== undefined) updateData.surname = surname;
    if (middleName !== undefined) updateData.middleName = middleName || null;
    if (firstName !== undefined) updateData.firstName = firstName;
    if (highestQualification !== undefined)
      updateData.highestQualification = highestQualification;
    if (academicRank !== undefined) updateData.academicRank = academicRank;
    if (specialization !== undefined)
      updateData.specialization = specialization || null;
    if (email !== undefined) updateData.email = email || null;
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
    });

    if (!existing) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
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
