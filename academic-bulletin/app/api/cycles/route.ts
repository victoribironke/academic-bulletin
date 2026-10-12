import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

export async function GET() {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const cycles = await prisma.reviewCycle.findMany({
      orderBy: { startedAt: "desc" },
      include: {
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        _count: {
          select: { submissions: true },
        },
      },
    });
    return NextResponse.json(cycles);
  } catch (error) {
    console.error("Failed to fetch review cycles", error);
    return NextResponse.json(
      { error: "Failed to fetch review cycles" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { name, description } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }

    // Set any currently active cycles to inactive
    await prisma.reviewCycle.updateMany({
      where: { isActive: true },
      data: { isActive: false, closedAt: new Date() },
    });

    const newCycle = await prisma.reviewCycle.create({
      data: {
        name,
        description,
        createdById: auth.user.id,
        isActive: true,
      },
    });

    return NextResponse.json(newCycle, { status: 201 });
  } catch (error) {
    console.error("Failed to create review cycle", error);
    return NextResponse.json(
      { error: "Failed to create review cycle" },
      { status: 500 },
    );
  }
}
