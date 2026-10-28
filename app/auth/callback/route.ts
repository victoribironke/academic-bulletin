import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  checkSignInAccess,
  rejectionFromProviderError,
} from "@/lib/sign-in-access";

/**
 * GET /auth/callback
 *
 * Google sends the user back here (via Supabase) after they pick an account.
 * We finish the sign-in, then only let them in if an administrator added
 * their email and the account is active.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const loginWithError = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, origin));

  const providerError =
    searchParams.get("error_description") ?? searchParams.get("error");
  if (providerError) {
    return loginWithError(rejectionFromProviderError(providerError));
  }

  const code = searchParams.get("code");
  if (!code) return loginWithError("sign_in_failed");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return loginWithError(rejectionFromProviderError(error?.message ?? null));
  }

  const authUser = data.user;
  const appUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { id: true, email: true, isActive: true },
  });

  const access = checkSignInAccess(authUser, appUser);
  if (!access.ok) {
    await supabase.auth.signOut({ scope: "global" });

    // If Supabase sign-ups were left on, this login created a brand-new auth
    // account for someone nobody added. Remove it so it can't linger.
    if (!appUser) {
      try {
        await createAdminClient().auth.admin.deleteUser(authUser.id);
      } catch (cleanupError) {
        console.error("Failed to remove unapproved auth user:", cleanupError);
      }
    }

    return loginWithError(access.reason);
  }

  return NextResponse.redirect(new URL("/dashboard", origin));
}
