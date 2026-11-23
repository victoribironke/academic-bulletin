import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { entityLabel, recordNames } from "@/lib/activity-names";

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

    // A4: the log opens on the current cycle. ?cycle=<id> shows one cycle,
    // ?cycle=all every entry (?archived=include, from A2, means the same).
    const cycleParam =
      searchParams.get("cycle") ?? (searchParams.get("archived") === "include" ? "all" : "current");
    const cycles = await prisma.reviewCycle.findMany({
      select: { id: true, name: true, isActive: true, isTest: true, archivedAt: true },
      orderBy: { startedAt: "desc" },
    });
    const running = cycles.find((cycle) => cycle.isActive && !cycle.archivedAt) ?? null;
    const chosen = cycleParam !== "current" && cycleParam !== "all" ? cycles.find((cycle) => cycle.id === cycleParam) : undefined;
    let cycleWhere: Prisma.ActivityLogWhereInput;
    let shown: { mode: "current" | "cycle" | "all"; id: string | null; name: string };
    if (cycleParam === "all") {
      cycleWhere = {};
      shown = { mode: "all", id: null, name: "All cycles" };
    } else if (chosen) {
      cycleWhere = { cycleId: chosen.id };
      shown = { mode: "cycle", id: chosen.id, name: chosen.name };
    } else if (running) {
      cycleWhere = { cycleId: running.id };
      shown = { mode: "current", id: running.id, name: running.name };
    } else {
      // No cycle running: everything except archived cycles' entries.
      cycleWhere = {
        OR: [{ cycleId: null }, { cycleId: { in: cycles.filter((cycle) => !cycle.archivedAt).map((cycle) => cycle.id) } }],
      };
      shown = { mode: "current", id: null, name: "No cycle running" };
    }

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
    const where: Prisma.ActivityLogWhereInput = { AND: [filters, cycleWhere] };

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

    // A4: plain names for the records, never their IDs.
    const names = await recordNames(items);
    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        record: {
          label: entityLabel(item.entityType),
          name: item.entityId ? (names.get(`${item.entityType}:${item.entityId}`) ?? null) : null,
        },
      })),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      cycle: shown,
      cycles: cycles.map((cycle) => ({
        id: cycle.id,
        name: cycle.name,
        current: cycle.id === running?.id,
        archived: Boolean(cycle.archivedAt),
        isTest: cycle.isTest,
      })),
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
