/**
 * Server-side steps shared by the two-step verification routes
 * (app/api/mfa/*, and the Super Admin reset).
 */
import { after, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSessionAccess } from "@/auth";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { sendTwoStepNoticeEmail, type TwoStepNotice } from "@/lib/email/notifications";
import { MFA_RATE_LIMITS, takeRateLimit } from "@/lib/rate-limit";
import { mfaRequiredFor, MFA_SESSION_MS } from "@/lib/mfa/policy";
import { findTrustedDevice, rememberDevice, trustedDeviceCookie } from "@/lib/mfa/trusted-device";
import { matchTotpStep } from "@/lib/mfa/totp";
import { NOT_SIGNED_IN } from "@/lib/messages";
import {
  decryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  MfaNotConfiguredError,
} from "@/lib/mfa/secrets";

type Tx = Prisma.TransactionClient;

export type MfaUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  mfaSecret: string | null;
  mfaEnabledAt: Date | null;
  mfaLastUsedStep: number | null;
};

/** `select` for the fields MfaUser needs, the secret included. */
export const MFA_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  mfaSecret: true,
  mfaEnabledAt: true,
  mfaLastUsedStep: true,
} as const;

export const fail = (status: number, error: string, code?: string, extra?: object) =>
  NextResponse.json({ error, ...(code && { code }), ...extra }, { status });

export const fullName = (user: { firstName: string; lastName: string }) =>
  `${user.firstName} ${user.lastName}`;

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

/**
 * The signed-in admin entering a code for this sign-in. Unlike getApiUser,
 * this lets in a session still waiting for its code; that's what it's for.
 */
export async function requireCodeEntrySession(): Promise<
  { ok: true; user: MfaUser; sessionId: string } | { ok: false; response: NextResponse }
> {
  const access = await getSessionAccess();
  if (!access) return { ok: false, response: fail(401, NOT_SIGNED_IN) };

  const user = await prisma.user.findUnique({
    where: { id: access.userId },
    select: { ...MFA_USER_SELECT, isActive: true },
  });
  if (!user?.isActive) return { ok: false, response: fail(401, NOT_SIGNED_IN) };
  if (!mfaRequiredFor(user.role)) {
    return {
      ok: false,
      response: fail(400, "Your account doesn't use two-step verification.", "MFA_NOT_REQUIRED"),
    };
  }
  if (!access.sessionId) {
    return { ok: false, response: fail(401, "Sign in again to continue.", "SIGN_IN_AGAIN") };
  }
  return { ok: true, user, sessionId: access.sessionId };
}

/** The 503 sent when the server has no usable MFA_ENCRYPTION_KEY. */
export function notConfiguredResponse(error: MfaNotConfiguredError): NextResponse {
  console.error(error.message);
  return fail(
    503,
    "Two-step verification isn't available right now. Ask the site administrator to check the server's MFA_ENCRYPTION_KEY setting.",
    "MFA_NOT_CONFIGURED",
  );
}

/** Sends a two-step notice by email once the response has gone. */
export function noticeAfterResponse(user: MfaUser, notice: TwoStepNotice, at = new Date()) {
  after(() =>
    sendTwoStepNoticeEmail({ to: user.email, firstName: user.firstName, notice, at }).then(
      () => undefined,
    ),
  );
}

/**
 * Counts one code attempt. Returns the 429 to send when the person is over
 * either limit, or null to go ahead. The first refusal in a window is logged
 * and emailed, since it may mean someone else is guessing.
 */
export async function takeCodeAttempt(user: MfaUser): Promise<NextResponse | null> {
  for (const name of ["mfaCode", "mfaCodeDaily"] as const) {
    const decision = await takeRateLimit(name, user.id);
    if (decision.ok) continue;

    if (decision.count === MFA_RATE_LIMITS[name].limit + 1) {
      await recordActivity({
        actorId: user.id,
        action: "MFA_LOCKED",
        entityType: "USER",
        entityId: user.id,
        description: `Paused code entry for ${fullName(user)} after too many tries${name === "mfaCodeDaily" ? " in a day" : ""}.`,
        metadata: { limit: name, retryAfterSeconds: decision.retryAfterSeconds },
      });
      noticeAfterResponse(user, { kind: "locked" });
    }

    const minutes = Math.ceil(decision.retryAfterSeconds / 60);
    return fail(
      429,
      name === "mfaCode"
        ? `Too many tries. Wait ${minutes} minute${minutes === 1 ? "" : "s"}, then try again.`
        : "Too many tries today. Try again tomorrow, or ask a Super Administrator for help.",
      "RATE_LIMITED",
      { retryAfterSeconds: decision.retryAfterSeconds },
    );
  }
  return null;
}

/**
 * Checks a six-digit code against the person's authenticator secret.
 * Returns the matching 30-second step, or the 400 to send.
 */
export function matchAuthenticatorCode(
  user: MfaUser,
  code: string,
  now: Date,
): { ok: true; step: number } | { ok: false; response: NextResponse } {
  const secret = decryptMfaSecret(user.mfaSecret!, user.id);
  const step = matchTotpStep(secret, code, now.getTime(), user.mfaLastUsedStep);
  if (step !== null) return { ok: true, step };

  const alreadyUsed = matchTotpStep(secret, code, now.getTime()) !== null;
  return { ok: false, response: wrongCodeResponse(alreadyUsed) };
}

export function wrongCodeResponse(alreadyUsed: boolean): NextResponse {
  return alreadyUsed
    ? fail(400, "That code has already been used. Wait for the next one, then enter it.", "CODE_ALREADY_USED")
    : fail(
        400,
        "That code isn't right. Enter the newest code your app shows. If it still fails, check your phone sets its time automatically.",
        "WRONG_CODE",
      );
}

/**
 * Records the step as used, so the same code can't be used again. False when
 * another request used it (or a later one) first.
 */
export async function claimAuthenticatorStep(
  tx: Tx,
  user: MfaUser,
  step: number,
  extra: Prisma.UserUpdateManyMutationInput = {},
): Promise<boolean> {
  const { count } = await tx.user.updateMany({
    where: {
      id: user.id,
      mfaSecret: user.mfaSecret,
      OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }],
    },
    data: { ...extra, mfaLastUsedStep: step },
  });
  return count === 1;
}

/**
 * Marks a recovery code used. Returns how many unused codes are left, or
 * null when the code isn't one of theirs or was used before.
 */
export async function spendRecoveryCode(
  tx: Tx,
  userId: string,
  code: string,
  now: Date,
): Promise<number | null> {
  const { count } = await tx.mfaRecoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(code, userId), usedAt: null },
    data: { usedAt: now },
  });
  if (count !== 1) return null;
  return tx.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
}

/** Replaces all of someone's recovery codes and returns the new ones. */
export async function replaceRecoveryCodes(tx: Tx, userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
  await tx.mfaRecoveryCode.createMany({
    data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code, userId) })),
  });
  return codes;
}

/**
 * Records that this sign-in passed two-step verification, which is what
 * lets the session act as an admin. The person's expired checks are cleared
 * out at the same time (the Activity Log keeps the history).
 */
export async function recordVerification(
  tx: Tx,
  opts: {
    userId: string;
    sessionId: string;
    method: "AUTHENTICATOR" | "RECOVERY_CODE" | "TRUSTED_DEVICE";
    now: Date;
  },
): Promise<void> {
  await tx.mfaVerification.upsert({
    where: { sessionId: opts.sessionId },
    create: {
      userId: opts.userId,
      sessionId: opts.sessionId,
      method: opts.method,
      verifiedAt: opts.now,
    },
    update: { userId: opts.userId, method: opts.method, verifiedAt: opts.now },
  });
  await tx.mfaVerification.deleteMany({
    where: {
      userId: opts.userId,
      verifiedAt: { lt: new Date(opts.now.getTime() - MFA_SESSION_MS) },
    },
  });
}

/** Thrown inside a transaction to roll it back with a reply ready to send. */
export class MfaRefusal extends Error {
  constructor(public response: NextResponse) {
    super("Two-step verification refused");
  }
}

/**
 * D11: when the person ticked "Remember this device for 30 days", remembers
 * this browser and sets its cookie on the reply. A failure here never undoes
 * the sign-in; they are just asked for a code next time.
 */
export async function withRememberedDevice(
  response: NextResponse,
  remember: boolean,
  userId: string,
  request: Request,
): Promise<NextResponse> {
  if (!remember) return response;
  try {
    const token = await rememberDevice(prisma, userId, request.headers.get("user-agent"));
    response.cookies.set(trustedDeviceCookie(token));
  } catch (error) {
    console.error("Couldn't remember this device:", error);
  }
  return response;
}

/**
 * D11: when this browser carries a remembered-device cookie that belongs to
 * the person and hasn't expired, records this sign-in's check without a
 * code (logged) and returns true.
 */
export async function passWithRememberedDevice(opts: {
  userId: string;
  sessionId: string;
  cookieValue: string | undefined;
  now?: Date;
}): Promise<boolean> {
  const now = opts.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const device = await findTrustedDevice(tx, opts.userId, opts.cookieValue, now);
    if (!device) return false;
    await recordVerification(tx, { userId: opts.userId, sessionId: opts.sessionId, method: "TRUSTED_DEVICE", now });
    await recordActivity(
      {
        actorId: opts.userId,
        action: "MFA_VERIFIED",
        entityType: "USER",
        entityId: opts.userId,
        description: "Signed in on a device they asked to remember for 30 days.",
        metadata: { method: "TRUSTED_DEVICE", deviceId: device.id },
      },
      tx,
    );
    return true;
  });
}
