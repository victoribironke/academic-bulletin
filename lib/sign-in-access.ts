/**
 * Decides whether someone who just signed in with Google may use the app.
 * Kept free of request/cookie handling so it can be unit tested.
 */

export type SignInRejection = "not_authorized" | "account_deactivated";

export type AppUserRecord = {
  id: string;
  email: string;
  isActive: boolean;
} | null;

/** Emails are compared trimmed and lower-cased. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function checkSignInAccess(
  googleAccount: { email?: string | null; emailVerified?: boolean | null },
  appUser: AppUserRecord,
): { ok: true } | { ok: false; reason: SignInRejection } {
  // Google must vouch for the address, or anyone could claim it.
  if (!googleAccount.emailVerified) return { ok: false, reason: "not_authorized" };

  // Only emails an administrator has added have an app user record.
  if (!appUser) return { ok: false, reason: "not_authorized" };

  // The Google account must use the same email the admin added.
  const email = normalizeEmail(googleAccount.email);
  if (!email || normalizeEmail(appUser.email) !== email) {
    return { ok: false, reason: "not_authorized" };
  }

  if (!appUser.isActive) return { ok: false, reason: "account_deactivated" };

  return { ok: true };
}
