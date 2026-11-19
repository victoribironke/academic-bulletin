/**
 * Decides whether someone who just signed in with Google may use the app.
 * Kept free of request/cookie handling so it can be unit tested.
 *
 * Staff sign in with their university Google Workspace account. A personal
 * account (Gmail or any other) gets in only while a Super Admin's sign-in
 * exception for it lasts, and can never hold an admin role.
 */

export type SignInRejection =
  | "not_authorized"
  | "account_deactivated"
  | "personal_account"
  | "personal_account_admin";

/** The university's Google Workspace domain. */
export const UNIVERSITY_DOMAIN = "babcock.edu.ng";

/** Roles a personal account can never hold. */
export const PRIVILEGED_ROLES = ["ADMIN", "SUPER_ADMIN"] as const;

/** The longest a single sign-in exception may run. */
export const MAX_SIGN_IN_EXCEPTION_DAYS = 90;

export type AppUserRecord = {
  id: string;
  email: string;
  isActive: boolean;
  role: string;
  signInExceptionUntil: Date | null;
} | null;

/** Emails are compared trimmed and lower-cased. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** True for an address at the university's own domain. */
export function isUniversityEmail(email: string | null | undefined): boolean {
  return normalizeEmail(email).endsWith(`@${UNIVERSITY_DOMAIN}`);
}

export function isPrivilegedRole(role: string): boolean {
  return (PRIVILEGED_ROLES as readonly string[]).includes(role);
}

export function hasActiveSignInException(
  user: { signInExceptionUntil: Date | null },
  now: Date = new Date(),
): boolean {
  return !!user.signInExceptionUntil && user.signInExceptionUntil > now;
}

/**
 * Whether a personal account (not the university's) may stay signed in:
 * never in an admin role, otherwise only while its exception lasts.
 */
export function personalAccountMayUseApp(
  user: { role: string; signInExceptionUntil: Date | null },
  now: Date = new Date(),
): boolean {
  return !isPrivilegedRole(user.role) && hasActiveSignInException(user, now);
}

export function checkSignInAccess(
  googleAccount: {
    email?: string | null;
    emailVerified?: boolean | null;
    /** Google's `hd` claim: the Workspace domain the account belongs to. */
    hostedDomain?: string | null;
  },
  appUser: AppUserRecord,
  now: Date = new Date(),
): { ok: true; viaException: boolean } | { ok: false; reason: SignInRejection } {
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

  // A university account has the university's address and Google says it
  // belongs to the university's Workspace.
  const universityAccount =
    isUniversityEmail(email) &&
    normalizeEmail(googleAccount.hostedDomain) === UNIVERSITY_DOMAIN;
  if (universityAccount) return { ok: true, viaException: false };

  if (isPrivilegedRole(appUser.role)) {
    return { ok: false, reason: "personal_account_admin" };
  }
  if (!hasActiveSignInException(appUser, now)) {
    return { ok: false, reason: "personal_account" };
  }
  return { ok: true, viaException: true };
}

const LAGOS_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A moment's calendar date (YYYY-MM-DD) in Lagos time. */
export function lagosDate(moment: Date): string {
  return LAGOS_DATE.format(moment);
}

/** The latest date an exception granted now may run to. */
export function latestSignInExceptionDate(now: Date = new Date()): string {
  return lagosDate(new Date(now.getTime() + MAX_SIGN_IN_EXCEPTION_DAYS * 86_400_000));
}

/**
 * Reads the date an exception ends (YYYY-MM-DD). It lasts to the end of that
 * day in Lagos (UTC+1, no daylight saving), from today up to 90 days ahead.
 */
export function parseSignInExceptionEnd(
  value: unknown,
  now: Date = new Date(),
): { ok: true; until: Date } | { ok: false; error: string } {
  const date = typeof value === "string" ? value.trim() : "";
  const isRealDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(`${date}T12:00:00Z`)) &&
    new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  if (!isRealDate) return { ok: false, error: "Choose the date the exception ends." };

  if (date < lagosDate(now)) {
    return { ok: false, error: "The end date can't be in the past." };
  }
  if (date > latestSignInExceptionDate(now)) {
    return {
      ok: false,
      error: `An exception can last at most ${MAX_SIGN_IN_EXCEPTION_DAYS} days. Choose ${latestSignInExceptionDate(now)} or earlier.`,
    };
  }
  return { ok: true, until: new Date(`${date}T23:59:59.999+01:00`) };
}
