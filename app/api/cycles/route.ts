import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { parseSubmissionsOpenAt } from "@/lib/submissions/submission-window";
import { requireApiUser } from "@/lib/api-auth";
import { serverTimer } from "@/lib/server-timing";
import { recordActivity } from "@/lib/activity-log";
import { couldNot } from "@/lib/messages";

export async function GET(request: Request) {
  try {
    const timer = serverTimer();
    const auth = await requireApiUser();
    timer.mark("auth");
    if (!auth.ok) return auth.response;

    // Archived cycles (task A2) are left out unless Academic Planning asks:
    // ?archived=only for the Archive page, ?archived=include for everything.
    const archived = new URL(request.url).searchParams.get("archived");
    const isAdmin = auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN";
    const where =
      isAdmin && archived === "only"
        ? { archivedAt: { not: null } }
        : isAdmin && archived === "include"
          ? {}
          : { archivedAt: null };

    const cycles = await prisma.reviewCycle.findMany({
      where,
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
    // Who archived each archived cycle, for the Archive page.
    const archiverIds = [...new Set(cycles.map((cycle) => cycle.archivedById).filter((id): id is string => Boolean(id)))];
    const archivers = archiverIds.length
      ? await prisma.user.findMany({
          where: { id: { in: archiverIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const archiverById = new Map(archivers.map((user) => [user.id, user]));
    timer.mark("db");
    return NextResponse.json(
      cycles.map((cycle) => ({
        ...cycle,
        archivedBy: cycle.archivedById ? (archiverById.get(cycle.archivedById) ?? null) : null,
      })),
      { headers: { "Server-Timing": timer.header() } },
    );
  } catch (error) {
    console.error("Failed to fetch review cycles", error);
    return NextResponse.json(
      { error: couldNot("load review cycles") },
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
      { error: couldNot("create review cycle") },
      { status: 500 },
    );
  }
}
