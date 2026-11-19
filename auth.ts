import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { allowGoogleSignIn, refreshSessionToken } from "@/lib/auth-callbacks";

/**
 * Google sign-in for people an administrator has added. Sessions live in a
 * signed cookie (no session table); the token carries the app user's id.
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
      return session;
    },
  },
});

/** The signed-in app user's id, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
