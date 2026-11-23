import { randomUUID } from "node:crypto";
import type { JWT } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { currentVerification, mfaRequiredFor, mfaStateOf } from "@/lib/mfa/policy";
import {
  checkSignInAccess,
  isUniversityEmail,
  normalizeEmail,
  personalAccountMayUseApp,
} from "@/lib/sign-in-access";
import { formatDate } from "@/lib/dates/format";

/**
 * Auth.js callbacks (wired up in /auth.ts), kept apart so they can be tested
 * against the database.
 */

// How often a signed-in session re-checks that the account still exists, is
// active, (for a personal account) still has a sign-in exception, and (for an
// admin) still has a valid two-step check. Deactivating someone, or their
// exception ending, signs them out within this time. A session waiting for an
// authenticator code checks on every request instead.
export const RECHECK_MS = 5 * 60 * 1000;

type GoogleProfile = {
  email?: string | null;
  email_verified?: boolean | null;
  /** The Google Workspace domain, present only for Workspace accounts. */
  hd?: unknown;
};


/** True to let the sign-in through, or the login page URL with the reason. */
export async function allowGoogleSignIn(
  profile: GoogleProfile | undefined,
): Promise<true | string> {
  const email = normalizeEmail(profile?.email);
  const appUser = email
    ? await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          isActive: true,
          role: true,
          signInExceptionUntil: true,
        },
      })
    : null;

  const access = checkSignInAccess(
    {
      email,
      emailVerified: profile?.email_verified === true,
      hostedDomain: typeof profile?.hd === "string" ? profile.hd : null,
    },
    appUser,
  );
  if (!access.ok) return `/login?error=${access.reason}`;

  // Every sign-in through an exception is on the record.
  if (access.viaException && appUser?.signInExceptionUntil) {
    await recordActivity({
      actorId: appUser.id,
      action: "SIGN_IN_VIA_EXCEPTION",
      entityType: "USER",
      entityId: appUser.id,
      description: `Signed in with a personal Google account under a sign-in exception that ends ${formatDate(appUser.signInExceptionUntil)}.`,
      metadata: { until: appUser.signInExceptionUntil.toISOString() },
    });
  }
  // D3: when each person first signed in and was last active.
  if (appUser) {
    const now = new Date();
    await prisma.user
      .updateMany({ where: { id: appUser.id, firstSignInAt: null }, data: { firstSignInAt: now } })
      .then(() => prisma.user.update({ where: { id: appUser.id }, data: { lastActiveAt: now } }))
      .catch((error) => console.error("Couldn't record the sign-in time:", error));
  }
  return true;
}

/**
 * Builds and refreshes the session token. Returns null to end the session
 * (account removed or deactivated, a personal account that may no longer
 * sign in, or an admin session from before two-step verification).
 *
 * Every sign-in gets a random session id. An admin's session starts as
 * "pending" and becomes "verified" once a code for that session id is on
 * record (see app/api/mfa). Nothing the browser sends can change that: the
 * state is always read back from the database.
 */
export async function refreshSessionToken(
  token: JWT,
  profile: GoogleProfile | undefined,
  now: number = Date.now(),
): Promise<JWT | null> {
  if (profile) {
    // Just signed in: point the session at the app user record.
    const appUser = await prisma.user.findUnique({
      where: { email: normalizeEmail(profile.email) },
      select: { id: true, role: true },
    });
    if (!appUser) return null;
    return {
      ...token,
      userId: appUser.id,
      checkedAt: now,
      sid: randomUUID(),
      mfa: mfaRequiredFor(appUser.role) ? "pending" : "none",
      mfaVerifiedAt: undefined,
    };
  }

  if (!token.userId) return null;
  const due =
    token.mfa === undefined ||
    mfaStateOf(token, now) === "pending" ||
    now - (token.checkedAt ?? 0) > RECHECK_MS;
  if (!due) return token;

  const appUser = await prisma.user.findUnique({
    where: { id: token.userId },
    select: {
      isActive: true,
      email: true,
      role: true,
      signInExceptionUntil: true,
      mfaVerifications: currentVerification(token.sid, now),
    },
  });
  if (!appUser?.isActive) return null;
  if (
    !isUniversityEmail(appUser.email) &&
    !personalAccountMayUseApp(appUser, new Date(now))
  ) {
    return null;
  }

  if (!mfaRequiredFor(appUser.role)) {
    return { ...token, checkedAt: now, mfa: "none", mfaVerifiedAt: undefined };
  }
  // An admin session from before two-step verification has no session id
  // to record a code against, so the person signs in again.
  if (!token.sid) return null;

  const verification = appUser.mfaVerifications[0];
  return verification
    ? {
        ...token,
        checkedAt: now,
        mfa: "verified",
        mfaVerifiedAt: verification.verifiedAt.getTime(),
      }
    : { ...token, checkedAt: now, mfa: "pending", mfaVerifiedAt: undefined };
}
