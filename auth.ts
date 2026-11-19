import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { allowGoogleSignIn, refreshSessionToken } from "@/lib/auth-callbacks";
import { mfaStateOf, type MfaState } from "@/lib/mfa/policy";

/**
 * Google sign-in for people an administrator has added. Sessions live in a
 * signed cookie (no session table); the token carries the app user's id, a
 * random id for the sign-in, and its two-step verification state.
 * Env: AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // Always show the account picker so staff can choose which account to use.
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn: ({ profile }) => allowGoogleSignIn(profile),
    jwt: ({ token, profile }) => refreshSessionToken(token, profile),
    session({ session, token }) {
      if (token.userId) session.user.id = token.userId;
      session.sessionId = token.sid ?? null;
      session.mfa = mfaStateOf(token);
      return session;
    },
  },
});

export type SessionAccess = {
  userId: string;
  /** This sign-in's random id, or null for a session from before it existed. */
  sessionId: string | null;
  mfa: MfaState;
};

/**
 * The signed-in user's id, sign-in id and two-step state, or null when
 * signed out. Most code wants getApiUser (lib/api-auth.ts) instead, which
 * also refuses an admin whose code hasn't been checked.
 */
export async function getSessionAccess(): Promise<SessionAccess | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return {
    userId,
    sessionId: session.sessionId ?? null,
    mfa: session.mfa ?? "pending",
  };
}

/**
 * The signed-in user's id, or null when signed out or still waiting for an
 * authenticator code.
 */
export async function getSessionUserId(): Promise<string | null> {
  const access = await getSessionAccess();
  return access && access.mfa !== "pending" ? access.userId : null;
}
