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

export function checkSignInAccess(
  authUser: { id: string; email?: string | null },
  appUser: AppUserRecord,
): { ok: true } | { ok: false; reason: SignInRejection } {
  // Only emails an administrator has added have an app user record.
  if (!appUser) return { ok: false, reason: "not_authorized" };

  // The Google login must belong to the same account the admin created.
  const authEmail = authUser.email?.trim().toLowerCase();
  if (appUser.id !== authUser.id || appUser.email.toLowerCase() !== authEmail) {
    return { ok: false, reason: "not_authorized" };
  }

  if (!appUser.isActive) return { ok: false, reason: "account_deactivated" };

  return { ok: true };
}

/** Maps an error that Supabase passes back to the callback onto a login message. */
export function rejectionFromProviderError(
  description: string | null,
): SignInRejection | "sign_in_failed" {
  const text = (description ?? "").toLowerCase();
  if (text.includes("banned")) return "account_deactivated";
  if (text.includes("signup") || text.includes("sign up") || text.includes("not allowed")) {
    return "not_authorized";
  }
  return "sign_in_failed";
}
