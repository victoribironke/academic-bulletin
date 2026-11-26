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

// GET /api/departments/[id] - Get a single department
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

    const { id } = await params;

    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        school: {
          select: { id: true, name: true, code: true },
        },
        programmes: {
          include: {
            _count: {
              select: { submissions: true },
            },
          },
        },
        _count: {
          select: { programmes: true, users: true },
        },
      },
    });

    if (!department) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(department);
  } catch (error) {
    console.error("Failed to fetch department:", error);
    return NextResponse.json(
      { error: couldNot("load department") },
      { status: 500 }
    );
  }
}

// PUT /api/departments/[id] - Update a department
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, code, description, schoolId } = body;

    const department = await prisma.department.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(code && { code: code.toUpperCase() }),
        ...(description !== undefined && { description }),
        ...(schoolId && { schoolId }),
      },
      include: {
        school: {
          select: { id: true, name: true, code: true },
        },
      },
    });
    await recordActivity({
      actorId: auth.user.id,
      action: "DEPARTMENT_UPDATED",
      entityType: "DEPARTMENT",
      entityId: id,
      description: `Updated the ${department.name} department.`,
    });

    return NextResponse.json(department);
  } catch (error: unknown) {
    console.error("Failed to update department:", error);

    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "P2025") {
        return NextResponse.json(
          { error: "Department not found" },
          { status: 404 }
        );
      }
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "A department with this code already exists" },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: couldNot("update department") },
      { status: 500 }
    );
  }
}

// DELETE /api/departments/[id] - Delete a department
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const record = await prisma.department.findUnique({ where: { id } });
    if (!record) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    // The workflow ledger of any bulletin that has moved is permanent.
    const conflict = await workflowHistoryConflict({ departmentId: id });
    if (conflict) return conflict;
    const blockers = await deleteBlockers("DEPARTMENT", id);
    if (blockers.length) return inUseResponse("department", blockers);
    const unconfirmed = await requireDeleteConfirmation(request, "department");
    if (unconfirmed) return unconfirmed;

    await prisma.$transaction(async (tx) => {
      await recordActivity(
        {
          actorId: auth.user.id,
          action: "DEPARTMENT_DELETED",
          entityType: "DEPARTMENT",
          entityId: id,
          description: `Deleted the department ${record.name}. It can be restored from the Archive.`,
        },
        tx,
      );
      await archiveRecord(tx, {
        entityType: "DEPARTMENT",
        entityId: id,
        label: record.name,
        data: record,
        actorId: auth.user.id,
      });
      await tx.department.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (error: unknown) {
    console.error("Failed to delete department:", error);
    return NextResponse.json(
      { error: couldNot("delete department") },
      { status: 500 },
    );
  }
}
