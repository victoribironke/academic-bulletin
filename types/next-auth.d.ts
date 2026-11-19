import "next-auth";
import "next-auth/jwt";
import type { MfaState } from "@/lib/mfa/policy";

declare module "next-auth" {
  interface Session {
    /** This sign-in's id; two-step checks are recorded against it. */
    sessionId?: string | null;
    /** Whether this sign-in still needs an authenticator code. */
    mfa?: MfaState;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** The app user's id (users.id). */
    userId?: string;
    /** When the account was last confirmed active, in ms since epoch. */
    checkedAt?: number;
    /** A random id for this sign-in, made when the person signs in. */
    sid?: string;
    /** Two-step verification state; see lib/mfa/policy.ts. */
    mfa?: MfaState;
    /** When this sign-in's authenticator code was accepted, in ms since epoch. */
    mfaVerifiedAt?: number;
  }
}
