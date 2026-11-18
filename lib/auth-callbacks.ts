import type { JWT } from "next-auth/jwt";
import prisma from "@/lib/prisma";
import { checkSignInAccess, normalizeEmail } from "@/lib/sign-in-access";

/**
 * Auth.js callbacks (wired up in /auth.ts), kept apart so they can be tested
 * against the database.
 */

// How often a signed-in session re-checks that the account still exists and
// is active. Deactivating someone signs them out within this time.
export const RECHECK_MS = 5 * 60 * 1000;

type GoogleProfile = { email?: string | null; email_verified?: boolean | null };

/** True to let the sign-in through, or the login page URL with the reason. */
export async function allowGoogleSignIn(
  profile: GoogleProfile | undefined,
): Promise<true | string> {
  const email = normalizeEmail(profile?.email);
  const appUser = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, isActive: true },
      })
    : null;

  const access = checkSignInAccess(
    { email, emailVerified: profile?.email_verified === true },
    appUser,
  );
  return access.ok ? true : `/login?error=${access.reason}`;
}

/**
 * Builds and refreshes the session token. Returns null to end the session
 * (account removed or deactivated).
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
    select: { isActive: true },
  });
  if (!appUser?.isActive) return null;
  return { ...token, checkedAt: now };
}
