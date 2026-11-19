import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";

/** GET /api/mfa/status - The signed-in admin's two-step set-up, for the menu. */
export async function GET() {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const [user, recoveryCodesLeft] = await Promise.all([
      prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { mfaEnabledAt: true },
      }),
      prisma.mfaRecoveryCode.count({ where: { userId: auth.user.id, usedAt: null } }),
    ]);
    return NextResponse.json({
      enabledAt: user?.mfaEnabledAt ?? null,
      recoveryCodesLeft,
    });
  } catch (error) {
    console.error("Failed to read two-step status:", error);
    return NextResponse.json({ error: "Failed to load two-step verification" }, { status: 500 });
  }
}
