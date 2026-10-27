import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

// GET /api/academic-units - Fetch the full tree (Schools -> Departments -> Programmes)
export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const units = await prisma.school.findMany({
      orderBy: { name: "asc" },
      include: {
        departments: {
          orderBy: { name: "asc" },
          include: {
            programmes: {
              orderBy: { name: "asc" },
            },
          },
        },
      },
    });

    return NextResponse.json(units);
  } catch (error) {
    console.error("Failed to fetch academic units:", error);
    return NextResponse.json(
      { error: "Failed to fetch academic units structure" },
      { status: 500 },
    );
  }
}
