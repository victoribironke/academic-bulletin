import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { workflowHistoryConflict } from "@/lib/submissions/workflow-history";
import {
  archiveRecord,
  deleteBlockers,
  inUseResponse,
  requireDeleteConfirmation,
} from "@/lib/archive";
import { couldNot } from "@/lib/messages";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/programmes/[id] - Get a single programme
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const programme = await prisma.programme.findUnique({
      where: { id },
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
        submissions: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            currentPhase: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!programme) {
      return NextResponse.json(
        { error: "Programme not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(programme);
  } catch (error) {
    console.error("Failed to fetch programme:", error);
    return NextResponse.json(
      { error: couldNot("load programme") },
      { status: 500 },
    );
  }
}

// PUT /api/programmes/[id] - Update a programme
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, code, description, degreeType, duration, departmentId } =
      body;

    const programme = await prisma.programme.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(code && { code: code.toUpperCase() }),
        ...(description !== undefined && { description }),
        ...(degreeType !== undefined && { degreeType }),
        ...(duration !== undefined && {
          duration: duration ? parseInt(duration) : null,
        }),
        ...(departmentId && { departmentId }),
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
    await recordActivity({
      actorId: auth.user.id,
      action: "PROGRAMME_UPDATED",
      entityType: "PROGRAMME",
      entityId: id,
      description: `Updated the ${programme.name} programme.`,
    });

    return NextResponse.json(programme);
  } catch (error: unknown) {
    console.error("Failed to update programme:", error);

    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2025") {
        return NextResponse.json(
          { error: "Programme not found" },
          { status: 404 },
        );
      }
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "A programme with this code already exists" },
          { status: 409 },
        );
      }
    }

    return NextResponse.json(
      { error: couldNot("update programme") },
      { status: 500 },
    );
  }
}

// DELETE /api/programmes/[id] - Delete a programme
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const record = await prisma.programme.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: "Programme not found" }, { status: 404 });
    }

    // The workflow ledger of any bulletin that has moved is permanent.
    const conflict = await workflowHistoryConflict({ programmeId: id });
    if (conflict) return conflict;
    const blockers = await deleteBlockers("PROGRAMME", id);
    if (blockers.length) return inUseResponse("programme", blockers);
    const unconfirmed = await requireDeleteConfirmation(request, "programme");
    if (unconfirmed) return unconfirmed;

    await prisma.$transaction(async (tx) => {
      await recordActivity(
        {
          actorId: auth.user.id,
          action: "PROGRAMME_DELETED",
          entityType: "PROGRAMME",
          entityId: id,
          description: `Deleted the programme ${record.name}. It can be restored from the Archive.`,
        },
        tx,
      );
      await archiveRecord(tx, {
        entityType: "PROGRAMME",
        entityId: id,
        label: record.name,
        data: record,
        actorId: auth.user.id,
      });
      await tx.programme.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (error: unknown) {
    console.error("Failed to delete programme:", error);
    return NextResponse.json(
      { error: couldNot("delete programme") },
      { status: 500 },
    );
  }
}
