import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { confirmationMatches, readConfirmation } from "@/lib/archive";
import { fail, fullName, MFA_USER_SELECT, noticeAfterResponse } from "@/lib/mfa/server";
import { resetTwoStepVerification } from "@/lib/mfa/reset";
import { isPrivilegedRole } from "@/lib/sign-in-access";
import { couldNot } from "@/lib/messages";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/users/[id]/mfa - Resets someone's two-step verification, for a
 * lost or replaced phone, after confirming who they are by phone (task D11).
 * A DAP officer (Academic Planning admin) can reset a Head, coordinator or
 * Dean; only a Super Administrator can reset an admin; nobody their own.
 * Ends their sessions at once and forgets their remembered devices; they set
 * up the app again at their next sign-in.
 * Body: { confirm: "<their email address>" }.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (id === auth.user.id) {
      return fail(
        403,
        "You can't reset your own two-step verification. Ask another Super Administrator, or the site administrator, to reset it.",
        "OWN_ACCOUNT",
      );
    }

    const target = await prisma.user.findUnique({ where: { id }, select: MFA_USER_SELECT });
    if (!target) return fail(404, "User not found");
    if (auth.user.role !== "SUPER_ADMIN" && isPrivilegedRole(target.role)) {
      return fail(
        403,
        "Only a Super Administrator can reset an administrator's two-step verification.",
        "SUPER_ADMIN_ONLY",
      );
    }
    if (!target.mfaEnabledAt && !target.mfaSecret) {
      return fail(409, `${fullName(target)} hasn't set up two-step verification.`, "MFA_NOT_SET_UP");
    }

    const typed = await readConfirmation(request);
    if (!confirmationMatches(typed, target.email)) {
      return fail(
        400,
        typed === null
          ? `Type ${target.email} to confirm.`
          : `That doesn't match. Type ${target.email} to confirm.`,
        "CONFIRMATION_REQUIRED",
        { confirmText: target.email },
      );
    }

    const endedSessions = await prisma.$transaction((tx) =>
      resetTwoStepVerification(tx, target, { actorId: auth.user.id, via: "users_page" }),
    );

    noticeAfterResponse(target, { kind: "reset" });
    return NextResponse.json({ success: true, endedSessions });
  } catch (error) {
    console.error("Failed to reset two-step verification:", error);
    return NextResponse.json(
      { error: couldNot("reset two-step verification") },
      { status: 500 },
    );
  }
}
