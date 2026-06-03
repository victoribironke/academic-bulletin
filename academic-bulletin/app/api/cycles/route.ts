import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
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
    const { name, description, createdById } = await request.json();

    if (!name || !createdById) {
      return NextResponse.json(
        { error: "Name and creator ID are required" },
        { status: 400 },
      );
    }

    // Check if user exists and is authorized (for safety, but mostly handled client side)
    const user = await prisma.user.findUnique({ where: { id: createdById } });
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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
        createdById,
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
