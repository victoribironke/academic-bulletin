import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { formatOpeningDate, parseSubmissionsOpenAt } from "@/lib/submissions/submission-window";
import {
  archiveRecord,
  deleteBlockers,
  inUseResponse,
  requireDeleteConfirmation,
} from "@/lib/archive";
import { couldNot } from "@/lib/messages";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { name, description, isActive } = body;

    // F0: when "Submit to School" opens for this cycle (null: no limit).
    const opensAt = parseSubmissionsOpenAt(body.submissionsOpenAt);
    if (!opensAt.ok) {
      return NextResponse.json({ error: opensAt.message }, { status: 400 });
    }

    // An archived cycle (task A2) is restored from the Archive before anything else.
    const existing = await prisma.reviewCycle.findUnique({
      where: { id },
      select: { archivedAt: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Review cycle not found" }, { status: 404 });
    }
    if (existing.archivedAt) {
      return NextResponse.json(
        {
          error: `${existing.name} is in the Archive. Restore it from the Archive before changing or reopening it.`,
          code: "CYCLE_ARCHIVED",
        },
        { status: 409 },
      );
    }

    // Build update data safely
    const dataToUpdate: Record<string, unknown> = {};
    if (name !== undefined) dataToUpdate.name = name;
    if (description !== undefined) dataToUpdate.description = description;
    if (opensAt.value !== undefined) dataToUpdate.submissionsOpenAt = opensAt.value;

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
    await recordActivity({
      actorId: auth.user.id,
      action:
        isActive === false
          ? "REVIEW_CYCLE_CLOSED"
          : isActive === true
            ? "REVIEW_CYCLE_OPENED"
            : "REVIEW_CYCLE_UPDATED",
      entityType: "REVIEW_CYCLE",
      entityId: id,
      description:
        opensAt.value === undefined
          ? `Updated the ${cycle.name} review cycle.`
          : opensAt.value
            ? `Updated the ${cycle.name} review cycle; submissions open on ${formatOpeningDate(opensAt.value)}.`
            : `Updated the ${cycle.name} review cycle; submissions are open with no start date.`,
    });

    return NextResponse.json(cycle);
  } catch (error) {
    console.error("Failed to update cycle:", error);
    return NextResponse.json(
      { error: couldNot("update review cycle") },
      { status: 500 },
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;

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
  } catch {
    return NextResponse.json(
      { error: couldNot("load review cycle") },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const cycle = await prisma.reviewCycle.findUnique({ where: { id } });
    if (!cycle) {
      return NextResponse.json(
        { error: "Review cycle not found" },
        { status: 404 },
      );
    }

    const blockers = await deleteBlockers("REVIEW_CYCLE", id);
    if (blockers.length) return inUseResponse("review cycle", blockers);
    const unconfirmed = await requireDeleteConfirmation(request, "review cycle");
    if (unconfirmed) return unconfirmed;

    await prisma.$transaction(async (tx) => {
      await recordActivity(
        {
          actorId: auth.user.id,
          action: "REVIEW_CYCLE_DELETED",
          entityType: "REVIEW_CYCLE",
          entityId: id,
          description: `Deleted the ${cycle.name} review cycle. It can be restored from the Archive.`,
        },
        tx,
      );
      await archiveRecord(tx, {
        entityType: "REVIEW_CYCLE",
        entityId: id,
        label: cycle.name,
        data: cycle,
        actorId: auth.user.id,
      });
      await tx.reviewCycle.delete({ where: { id } });
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    console.error("Failed to delete review cycle:", error);
    return NextResponse.json(
      { error: couldNot("delete review cycle") },
      { status: 500 },
    );
  }
}
