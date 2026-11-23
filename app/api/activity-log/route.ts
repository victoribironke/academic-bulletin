import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { archivedEntityIds, withoutArchivedEntries } from "@/lib/cycles/archive";

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() || "";
    const action = searchParams.get("action") || "";
    const entityType = searchParams.get("entityType") || "";
    const actorId = searchParams.get("actorId") || "";
    // The page sends the start and end of the chosen day in the viewer's
    // own time zone, so the server doesn't have to guess it.
    const from = parseDate(searchParams.get("from"));
    const to = parseDate(searchParams.get("to"));
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(
      100,
      Math.max(10, Number(searchParams.get("pageSize")) || 25),
    );

    // Entries about an archived cycle and its drafts (task A2) are left out
    // unless the page asks for them with ?archived=include.
    const includeArchived = searchParams.get("archived") === "include";
    const hidden = includeArchived ? [] : await archivedEntityIds();

    const filters: Prisma.ActivityLogWhereInput = {
      ...(action && { action }),
      ...(entityType && { entityType }),
      ...(actorId && { actorId }),
      ...((from || to) && {
        createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) },
      }),
      ...(query && {
        OR: [
          { description: { contains: query, mode: "insensitive" } },
          { entityId: { contains: query, mode: "insensitive" } },
          { actor: { firstName: { contains: query, mode: "insensitive" } } },
          { actor: { lastName: { contains: query, mode: "insensitive" } } },
          { actor: { email: { contains: query, mode: "insensitive" } } },
        ],
      }),
    };
    const where: Prisma.ActivityLogWhereInput = { AND: [filters, withoutArchivedEntries(hidden)] };

    const [items, total, actionGroups, entityGroups, actors] =
      await prisma.$transaction([
        prisma.activityLog.findMany({
          where,
          include: {
            actor: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.activityLog.count({ where }),
        prisma.activityLog.groupBy({ by: ["action"], orderBy: { action: "asc" } }),
        prisma.activityLog.groupBy({
          by: ["entityType"],
          orderBy: { entityType: "asc" },
        }),
        prisma.user.findMany({
          where: { activities: { some: {} } },
          select: { id: true, firstName: true, lastName: true, email: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        }),
      ]);

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      archivedHidden: hidden.length > 0,
      filters: {
        actions: actionGroups.map((group) => group.action),
        entityTypes: entityGroups.map((group) => group.entityType),
        actors,
      },
    });
  } catch (error) {
    console.error("Failed to fetch activity log:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity log" },
      { status: 500 },
    );
  }
}
