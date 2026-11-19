/**
 * Who needs two-step verification, and how long a check lasts. No database
 * access here, so the sign-in callbacks and the proxy can use it.
 */
import { isPrivilegedRole } from "@/lib/sign-in-access";

/**
 * "none": the account doesn't use two-step verification.
 * "pending": an admin who hasn't entered a code for this sign-in yet.
 * "verified": an admin who entered one within the last MFA_SESSION_HOURS.
 */
export type MfaState = "none" | "pending" | "verified";

/**
 * Academic Planning Admins and Super Admins enter a code at every sign-in,
 * and again after this many hours (the NIST AAL2 limit).
 */
export const MFA_SESSION_HOURS = 12;
export const MFA_SESSION_MS = MFA_SESSION_HOURS * 60 * 60 * 1000;

export function mfaRequiredFor(role: string): boolean {
  return isPrivilegedRole(role);
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
