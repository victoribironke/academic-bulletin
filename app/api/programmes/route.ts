import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/programmes - List all programmes (with optional department/school filter)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("departmentId");
    const schoolId = searchParams.get("schoolId");

    const programmes = await prisma.programme.findMany({
      where: {
        ...(departmentId && { departmentId }),
        ...(schoolId && { department: { schoolId } }),
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
        _count: {
          select: { submissions: true },
        },
      },
      orderBy: [
        { department: { school: { name: "asc" } } },
        { department: { name: "asc" } },
        { name: "asc" },
      ],
    });

    return NextResponse.json(programmes);
  } catch (error) {
    console.error("Failed to fetch programmes:", error);
    return NextResponse.json(
      { error: "Failed to fetch programmes" },
      { status: 500 }
    );
  }
}

// POST /api/programmes - Create a new programme
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, code, description, degreeType, duration, departmentId } =
      body;

    if (!name || !code || !departmentId) {
      return NextResponse.json(
        { error: "Name, code, and departmentId are required" },
        { status: 400 }
      );
    }

    const programme = await prisma.programme.create({
      data: {
        name,
        code: code.toUpperCase(),
        description,
        degreeType,
        duration: duration ? parseInt(duration) : null,
        departmentId,
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

    return NextResponse.json(programme, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to create programme:", error);

    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "A programme with this code already exists" },
          { status: 409 }
        );
      }
      if (error.code === "P2003") {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to create programme" },
      { status: 500 }
    );
  }
}
