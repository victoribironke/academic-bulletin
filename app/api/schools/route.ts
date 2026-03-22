import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/schools - List all schools
export async function GET() {
  try {
    const schools = await prisma.school.findMany({
      include: {
        _count: {
          select: { departments: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(schools);
  } catch (error) {
    console.error("Failed to fetch schools:", error);
    return NextResponse.json(
      { error: "Failed to fetch schools" },
      { status: 500 }
    );
  }
}

// POST /api/schools - Create a new school
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, code, description } = body;

    if (!name || !code) {
      return NextResponse.json(
        { error: "Name and code are required" },
        { status: 400 }
      );
    }

    // Basic HTML sanitization to prevent XSS
    const sanitize = (str: string) => str?.replace(/<[^>]*>?/gm, "");

    const school = await prisma.school.create({
      data: {
        name: sanitize(name),
        code: sanitize(code).toUpperCase(),
        description: description ? sanitize(description) : description,
      },
    });

    return NextResponse.json(school, { status: 201 });
  } catch (error: unknown) {
    console.error("Failed to create school:", error);

    // Handle unique constraint violation
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A school with this name or code already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create school" },
      { status: 500 }
    );
  }
}
