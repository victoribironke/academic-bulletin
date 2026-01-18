import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/staff - Get all staff (optionally filtered by department)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const type = searchParams.get("type"); // ACADEMIC, ADJUNCT, NON_ACADEMIC

    const where: Record<string, unknown> = { isActive: true };
    if (departmentId) where.departmentId = departmentId;
    if (type) where.type = type;

    const staff = await prisma.staff.findMany({
      where,
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
        _count: {
          select: { courses: true },
        },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(staff);
  } catch (error) {
    console.error("Failed to fetch staff:", error);
    return NextResponse.json(
      { error: "Failed to fetch staff" },
      { status: 500 },
    );
  }
}

// POST /api/staff - Create a new staff member
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, position, specialization, email, type, departmentId } = body;

    if (!name || !position || !departmentId) {
      return NextResponse.json(
        { error: "Name, position, and departmentId are required" },
        { status: 400 },
      );
    }

    // Validate type
    const validTypes = ["ACADEMIC", "ADJUNCT", "NON_ACADEMIC"];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid staff type" },
        { status: 400 },
      );
    }

    const staff = await prisma.staff.create({
      data: {
        name,
        position,
        specialization: specialization || null,
        email: email || null,
        type: type || "ACADEMIC",
        departmentId,
      },
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

    return NextResponse.json(staff, { status: 201 });
  } catch (error) {
    console.error("Failed to create staff:", error);
    return NextResponse.json(
      { error: "Failed to create staff member" },
      { status: 500 },
    );
  }
}
