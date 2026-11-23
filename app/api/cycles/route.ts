import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseSubmissionsOpenAt } from "@/lib/submissions/submission-window";
import { requireApiUser } from "@/lib/api-auth";
import { serverTimer } from "@/lib/server-timing";
import { recordActivity } from "@/lib/activity-log";

export async function GET() {
  try {
    const timer = serverTimer();
    const auth = await requireApiUser();
    timer.mark("auth");
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
    timer.mark("db");
    return NextResponse.json(cycles, { headers: { "Server-Timing": timer.header() } });
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

    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 },
      );
    }
    // F0: when "Submit to School" opens for this cycle (optional).
    const opensAt = parseSubmissionsOpenAt(body.submissionsOpenAt);
    if (!opensAt.ok) {
      return NextResponse.json({ error: opensAt.message }, { status: 400 });
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
        ...(opensAt.value !== undefined && { submissionsOpenAt: opensAt.value }),
      },
    });
    await recordActivity({
      actorId: auth.user.id,
      action: "REVIEW_CYCLE_CREATED",
      entityType: "REVIEW_CYCLE",
      entityId: newCycle.id,
      description: `Created and activated the ${newCycle.name} review cycle.`,
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
