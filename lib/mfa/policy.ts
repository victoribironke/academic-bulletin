/**
 * Who needs two-step verification, and how long a check lasts. No database
 * access here, so the sign-in callbacks and the proxy can use it.
 */

/**
 * "none": the account doesn't use two-step verification.
 * "pending": someone who hasn't entered a code for this sign-in yet.
 * "verified": someone who entered one within the last MFA_SESSION_HOURS
 * (or signed in on a device they asked to remember, task D11).
 */
export type MfaState = "none" | "pending" | "verified";

/**
 * Everyone enters a code at sign-in (decision DEC18, task D11), and again
 * after this many hours (the NIST AAL2 limit), unless they ticked "Remember
 * this device for 30 days" on this browser.
 */
export const MFA_SESSION_HOURS = 12;
export const MFA_SESSION_MS = MFA_SESSION_HOURS * 60 * 60 * 1000;

/**
 * DEC18: two-step verification for every role, not only admins. The role
 * stays in the signature so callers don't change if the rule ever narrows.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function mfaRequiredFor(_role: string): boolean {
  return true;
}

/** The session's state as its token records it. */
export function mfaStateOf(
  token: { mfa?: MfaState; mfaVerifiedAt?: number },
  now: number = Date.now(),
): MfaState {
  if (token.mfa === "none") return "none";
  if (
    token.mfa === "verified" &&
    typeof token.mfaVerifiedAt === "number" &&
    now - token.mfaVerifiedAt < MFA_SESSION_MS
  ) {
    return "verified";
  }
  return "pending";
}

/**
 * Prisma `select` for a user's still-valid check on this sign-in. Session ids
 * are random UUIDs, so the empty string a session without one falls back to
 * never matches.
 */
export function currentVerification(sessionId: string | null | undefined, now: number = Date.now()) {
  return {
    where: {
      sessionId: sessionId ?? "",
      verifiedAt: { gt: new Date(now - MFA_SESSION_MS) },
    },
    select: { verifiedAt: true },
    take: 1,
  } as const;
}

/** A same-site path to go to after the code, or the dashboard. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/dashboard";
  }
  if (value.startsWith("/login") || value.startsWith("/verify") || value.startsWith("/api")) {
    return "/dashboard";
  }
  return value;
}
