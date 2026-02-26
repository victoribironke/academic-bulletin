import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, isActive } = body;

    // Build update data safely
    const dataToUpdate: Record<string, unknown> = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (description !== undefined) dataToUpdate.description = description;

    // If they are closing the cycle
    if (isActive === false) {
      dataToUpdate.isActive = false;
      const currentCycle = await prisma.reviewCycle.findUnique({
        where: { id },
      });
      if (!currentCycle?.closedAt) {
        dataToUpdate.closedAt = new Date();
      }
    }
    // If they are opening the cycle
    else if (isActive === true) {
      // Set all others to inactive
      await prisma.reviewCycle.updateMany({
        where: { isActive: true, id: { not: id } },
        data: { isActive: false, closedAt: new Date() },
      });
      dataToUpdate.isActive = true;
      dataToUpdate.closedAt = null; // Re-open
    }

    const cycle = await prisma.reviewCycle.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json(cycle);
  } catch (error) {
    console.error("Failed to update cycle:", error);
    return NextResponse.json(
      { error: "Failed to update review cycle" },
      { status: 500 },
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cycle = await prisma.reviewCycle.findUnique({
      where: { id },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!cycle) {
      return NextResponse.json(
        { error: "Review cycle not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(cycle);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch review cycle" },
      { status: 500 },
    );
  }
}
