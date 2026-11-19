import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  fail,
  notConfiguredResponse,
  requireCodeEntrySession,
} from "@/lib/mfa/server";
import { encryptMfaSecret, MfaNotConfiguredError } from "@/lib/mfa/secrets";
import {
  formatSecretForTyping,
  generateTotpSecret,
  otpauthUri,
  TOTP_ISSUER,
} from "@/lib/mfa/totp";
import { qrCodeDataUrl } from "@/lib/mfa/qr";

/**
 * POST /api/mfa/setup - Starts setting up an authenticator app: makes a new
 * secret and returns it as a QR code. Every start makes a fresh secret, so
 * one shown in another window or earlier attempt stops working.
 */
export async function POST() {
  try {
    const gate = await requireCodeEntrySession();
    if (!gate.ok) return gate.response;
    const { user } = gate;

    if (user.mfaEnabledAt) {
      return fail(
        409,
        "Your authenticator app is already set up. Enter its code instead.",
        "MFA_ALREADY_SET_UP",
      );
    }

    const secret = generateTotpSecret();
    const { count } = await prisma.user.updateMany({
      where: { id: user.id, mfaEnabledAt: null },
      data: { mfaSecret: encryptMfaSecret(secret, user.id), mfaLastUsedStep: null },
    });
    if (count !== 1) {
      return fail(409, "Your authenticator app is already set up.", "MFA_ALREADY_SET_UP");
    }

    return NextResponse.json(
      {
        qrCode: qrCodeDataUrl(otpauthUri(secret, user.email)),
        secret: formatSecretForTyping(secret),
        account: user.email,
        issuer: TOTP_ISSUER,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MfaNotConfiguredError) return notConfiguredResponse(error);
    console.error("Failed to start two-step set-up:", error);
    return fail(500, "Couldn't start the set-up. Please try again.");
  }
}
