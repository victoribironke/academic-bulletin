import type { JWT } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import {
  checkSignInAccess,
  isUniversityEmail,
  normalizeEmail,
  personalAccountMayUseApp,
} from "@/lib/sign-in-access";

/**
 * Auth.js callbacks (wired up in /auth.ts), kept apart so they can be tested
 * against the database.
 */

// How often a signed-in session re-checks that the account still exists, is
// active, and (for a personal account) still has a sign-in exception.
// Deactivating someone, or their exception ending, signs them out within
// this time.
export const RECHECK_MS = 5 * 60 * 1000;

type GoogleProfile = {
  email?: string | null;
  email_verified?: boolean | null;
  /** The Google Workspace domain, present only for Workspace accounts. */
  hd?: unknown;
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "Africa/Lagos",
});

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
      description: `Signed in with a personal Google account under a sign-in exception that ends ${dateFormat.format(appUser.signInExceptionUntil)}.`,
      metadata: { until: appUser.signInExceptionUntil.toISOString() },
    });
  }
  return true;
}

/**
 * Builds and refreshes the session token. Returns null to end the session
 * (account removed or deactivated, or a personal account that may no longer
 * sign in).
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
      select: { id: true },
    });
    if (!appUser) return null;
    return { ...token, userId: appUser.id, checkedAt: now };
  }

  if (!token.userId) return null;
  if (now - (token.checkedAt ?? 0) <= RECHECK_MS) return token;

  const appUser = await prisma.user.findUnique({
    where: { id: token.userId },
    select: { isActive: true, email: true, role: true, signInExceptionUntil: true },
  });
  if (!appUser?.isActive) return null;
  if (
    !isUniversityEmail(appUser.email) &&
    !personalAccountMayUseApp(appUser, new Date(now))
  ) {
    return null;
  }
  return { ...token, checkedAt: now };
}
