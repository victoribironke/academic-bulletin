import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { toTitleCase, isValidName } from "@/lib/validation/name-format";
import { canAccessDepartment, requireApiUser } from "@/lib/api-auth";

// GET /api/staff/[id] - Get single staff member
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

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

    if (!(await canAccessDepartment(auth.user, staff.department.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    const auth = await requireApiUser(["HOD", "ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const {
      title,
      gender,
      surname,
      middleName,
      firstName,
      highestQualification,
      academicRank,
      customJobTitle,
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
    if (!(await canAccessDepartment(auth.user, existing.departmentId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate names if provided
    if (surname !== undefined && !isValidName(surname)) {
      return NextResponse.json(
        {
          error:
            "Invalid surname. Only letters, spaces, hyphens, and apostrophes allowed",
        },
        { status: 400 },
      );
    }
    if (firstName !== undefined && !isValidName(firstName)) {
      return NextResponse.json(
        {
          error:
            "Invalid first name. Only letters, spaces, hyphens, and apostrophes allowed",
        },
        { status: 400 },
      );
    }
    if (middleName && !isValidName(middleName)) {
      return NextResponse.json(
        {
          error:
            "Invalid middle name. Only letters, spaces, hyphens, and apostrophes allowed",
        },
        { status: 400 },
      );
    }

    // Build update data with name formatting
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (gender !== undefined) updateData.gender = gender;
    if (surname !== undefined) updateData.surname = toTitleCase(surname);
    if (middleName !== undefined)
      updateData.middleName = middleName ? toTitleCase(middleName) : null;
    if (firstName !== undefined) updateData.firstName = toTitleCase(firstName);
    if (highestQualification !== undefined)
      updateData.highestQualification = highestQualification;
    if (academicRank !== undefined) updateData.academicRank = academicRank;
    if (specialization !== undefined)
      updateData.specialization = specialization || null;
    if (customJobTitle !== undefined) {
      updateData.customJobTitle =
        academicRank === "OTHER" && customJobTitle
          ? toTitleCase(customJobTitle)
          : null;
    }
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
    const auth = await requireApiUser(["HOD", "ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    // Check if staff exists
    const existing = await prisma.staff.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Staff not found" }, { status: 404 });
    }
    if (!(await canAccessDepartment(auth.user, existing.departmentId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
