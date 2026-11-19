import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import {
  claimAuthenticatorStep,
  fail,
  fullName,
  matchAuthenticatorCode,
  MfaRefusal,
  noticeAfterResponse,
  notConfiguredResponse,
  readJsonBody,
  recordVerification,
  requireCodeEntrySession,
  takeCodeAttempt,
  spendRecoveryCode,
  wrongCodeResponse,
} from "@/lib/mfa/server";
import { MfaNotConfiguredError, normalizeRecoveryCode } from "@/lib/mfa/secrets";
import { normalizeTotpCode } from "@/lib/mfa/totp";

/**
 * POST /api/mfa/verify - Checks this sign-in's code: six digits from the
 * authenticator app, or a one-time recovery code. Body: { code }.
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireCodeEntrySession();
    if (!gate.ok) return gate.response;
    const { user, sessionId } = gate;

    if (!user.mfaEnabledAt || !user.mfaSecret) {
      return fail(409, "Set up your authenticator app first.", "MFA_NOT_SET_UP");
    }

    const input = (await readJsonBody(request)).code;
    const code = normalizeTotpCode(input);
    const recoveryCode = code ? null : normalizeRecoveryCode(input);
    if (!code && !recoveryCode) {
      return fail(
        400,
        "Enter the 6-digit code from your authenticator app, or one of your recovery codes.",
        "WRONG_CODE",
      );
    }

    const limited = await takeCodeAttempt(user);
    if (limited) return limited;

    const now = new Date();

    if (code) {
      const match = matchAuthenticatorCode(user, code, now);
      if (!match.ok) return match.response;

      await prisma.$transaction(async (tx) => {
        if (!(await claimAuthenticatorStep(tx, user, match.step))) {
          throw new MfaRefusal(wrongCodeResponse(true));
        }
        await recordVerification(tx, { userId: user.id, sessionId, method: "AUTHENTICATOR", now });
        await recordActivity(
          {
            actorId: user.id,
            action: "MFA_VERIFIED",
            entityType: "USER",
            entityId: user.id,
            description: `${fullName(user)} signed in with two-step verification (authenticator app).`,
          },
          tx,
        );
      });
      return NextResponse.json({ ok: true, method: "AUTHENTICATOR" });
    }

    const codesLeft = await prisma.$transaction(async (tx) => {
      const left = await spendRecoveryCode(tx, user.id, recoveryCode!, now);
      if (left === null) {
        throw new MfaRefusal(
          fail(400, "That recovery code isn't right, or it has been used already.", "WRONG_CODE"),
        );
      }
      await recordVerification(tx, { userId: user.id, sessionId, method: "RECOVERY_CODE", now });
      await recordActivity(
        {
          actorId: user.id,
          action: "MFA_RECOVERY_CODE_USED",
          entityType: "USER",
          entityId: user.id,
          description: `${fullName(user)} signed in with a recovery code instead of the authenticator app. ${left} recovery code${left === 1 ? "" : "s"} left.`,
          metadata: { codesLeft: left },
        },
        tx,
      );
      return left;
    });

    noticeAfterResponse(user, { kind: "recovery_code_used", codesLeft }, now);
    return NextResponse.json({ ok: true, method: "RECOVERY_CODE", recoveryCodesLeft: codesLeft });
  } catch (error) {
    if (error instanceof MfaRefusal) return error.response;
    if (error instanceof MfaNotConfiguredError) return notConfiguredResponse(error);
    console.error("Failed to check two-step code:", error);
    return fail(500, "Couldn't check the code. Please try again.");
  }
}
