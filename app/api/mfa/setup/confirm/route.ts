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
  withRememberedDevice,
  replaceRecoveryCodes,
  requireCodeEntrySession,
  takeCodeAttempt,
} from "@/lib/mfa/server";
import { MfaNotConfiguredError } from "@/lib/mfa/secrets";
import { normalizeTotpCode } from "@/lib/mfa/totp";

/**
 * POST /api/mfa/setup/confirm - Finishes the set-up with the first code from
 * the app. Turns two-step verification on, counts as this sign-in's check,
 * and returns ten recovery codes, shown this once. Body: { code }.
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await requireCodeEntrySession();
    if (!gate.ok) return gate.response;
    const { user, sessionId } = gate;

    if (user.mfaEnabledAt) {
      return fail(409, "Your authenticator app is already set up.", "MFA_ALREADY_SET_UP");
    }
    if (!user.mfaSecret) {
      return fail(409, "Start the set-up again to get a QR code.", "MFA_SETUP_MISSING");
    }

    const body = await readJsonBody(request);
    const code = normalizeTotpCode(body.code);
    // D11: "Remember this device for 30 days".
    const remember = body.rememberDevice === true;
    if (!code) return fail(400, "Enter the 6-digit code your authenticator app shows.", "WRONG_CODE");

    const limited = await takeCodeAttempt(user);
    if (limited) return limited;

    const now = new Date();
    const match = matchAuthenticatorCode(user, code, now);
    if (!match.ok) return match.response;

    const recoveryCodes = await prisma.$transaction(async (tx) => {
      const claimed = await claimAuthenticatorStep(tx, user, match.step, { mfaEnabledAt: now });
      if (!claimed) {
        throw new MfaRefusal(
          fail(409, "The set-up changed in another window. Start it again here.", "MFA_SETUP_CHANGED"),
        );
      }
      const codes = await replaceRecoveryCodes(tx, user.id);
      await recordVerification(tx, { userId: user.id, sessionId, method: "AUTHENTICATOR", now });
      await recordActivity(
        {
          actorId: user.id,
          action: "MFA_ENABLED",
          entityType: "USER",
          entityId: user.id,
          description: `${fullName(user)} set up two-step verification with an authenticator app.`,
          metadata: { email: user.email },
        },
        tx,
      );
      return codes;
    });

    noticeAfterResponse(user, { kind: "enabled" }, now);
    return withRememberedDevice(
      NextResponse.json(
        { recoveryCodes, rememberedDevice: remember },
        { headers: { "Cache-Control": "no-store" } },
      ),
      remember,
      user.id,
      request,
    );
  } catch (error) {
    if (error instanceof MfaRefusal) return error.response;
    if (error instanceof MfaNotConfiguredError) return notConfiguredResponse(error);
    console.error("Failed to finish two-step set-up:", error);
    return fail(500, "Couldn't finish the set-up. Please try again.");
  }
}
