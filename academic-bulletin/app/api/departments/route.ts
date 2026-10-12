import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

// GET /api/departments - List all departments (with optional school filter)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");

    const departments = await prisma.department.findMany({
      where: schoolId ? { schoolId } : undefined,
      include: {
        school: {
          select: { id: true, name: true, code: true },
        },
        _count: {
          select: { programmes: true, users: true },
        },
      },
      orderBy: [{ school: { name: "asc" } }, { name: "asc" }],
    });

    return NextResponse.json(departments);
  } catch (error) {
    console.error("Failed to fetch departments:", error);
    return NextResponse.json(
      { error: "Failed to fetch departments" },
      { status: 500 }
    );
  }
}

// POST /api/departments - Create a new department
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, code, description, schoolId } = body;

    if (!name || !code || !schoolId) {
      return NextResponse.json(
        { error: "Name, code, and schoolId are required" },
        { status: 400 }
      );
    }

    const department = await prisma.department.create({
      data: {
        name,
        code: code.toUpperCase(),
        description,
        schoolId,
      },
      include: {
        school: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    return NextResponse.json(department, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to create department:", error);

    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "A department with this code already exists" },
          { status: 409 }
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "School not found" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create department" },
      { status: 500 }
    );
  }
}
