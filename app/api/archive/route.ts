import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

/**
 * GET /api/archive
 *
 * Records deleted into the Archive, newest first, for administrators to
 * review and restore.
 */
export async function GET() {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const records = await prisma.archivedRecord.findMany({
      orderBy: { archivedAt: "desc" },
      take: 500,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        label: true,
        archivedAt: true,
        archivedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return NextResponse.json(records);
  } catch (error) {
    console.error("Failed to list the Archive:", error);
    return NextResponse.json(
      { error: "Failed to load the Archive" },
      { status: 500 },
    );
  }
}
