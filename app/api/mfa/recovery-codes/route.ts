import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import {
  claimAuthenticatorStep,
  fail,
  fullName,
  matchAuthenticatorCode,
  MFA_USER_SELECT,
  MfaRefusal,
  noticeAfterResponse,
  notConfiguredResponse,
  readJsonBody,
  replaceRecoveryCodes,
  takeCodeAttempt,
  wrongCodeResponse,
} from "@/lib/mfa/server";
import { MfaNotConfiguredError } from "@/lib/mfa/secrets";
import { normalizeTotpCode } from "@/lib/mfa/totp";

/**
 * POST /api/mfa/recovery-codes - Replaces the signed-in admin's recovery
 * codes. Needs a current code from the authenticator app, so a session
 * alone can't do it. Body: { code }.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: MFA_USER_SELECT,
    });
    if (!user?.mfaEnabledAt || !user.mfaSecret) {
      return fail(409, "Set up your authenticator app first.", "MFA_NOT_SET_UP");
    }

    const code = normalizeTotpCode((await readJsonBody(request)).code);
    if (!code) {
      return fail(400, "Enter the 6-digit code your authenticator app shows.", "WRONG_CODE");
    }

    const limited = await takeCodeAttempt(user);
    if (limited) return limited;

    const now = new Date();
    const match = matchAuthenticatorCode(user, code, now);
    if (!match.ok) return match.response;

    const recoveryCodes = await prisma.$transaction(async (tx) => {
      if (!(await claimAuthenticatorStep(tx, user, match.step))) {
        throw new MfaRefusal(wrongCodeResponse(true));
      }
      const codes = await replaceRecoveryCodes(tx, user.id);
      await recordActivity(
        {
          actorId: user.id,
          action: "MFA_RECOVERY_CODES_RENEWED",
          entityType: "USER",
          entityId: user.id,
          description: `${fullName(user)} made new recovery codes. The old ones no longer work.`,
        },
        tx,
      );
      return codes;
    });

    noticeAfterResponse(user, { kind: "recovery_codes_renewed" }, now);
    return NextResponse.json(
      { recoveryCodes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MfaRefusal) return error.response;
    if (error instanceof MfaNotConfiguredError) return notConfiguredResponse(error);
    console.error("Failed to renew recovery codes:", error);
    return fail(500, "Couldn't make new recovery codes. Please try again.");
  }
}
