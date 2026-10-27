import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE_NAME,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "./config";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // API routes do their own auth checks.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookieOptions: {
        name: AUTH_COOKIE_NAME,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Protect routes
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginRoute = pathname.startsWith("/login");
  const isInviteFlowRoute =
    pathname.startsWith("/confirm") ||
    pathname.startsWith("/invite-accept");
  const isPasswordRecoveryRoute = pathname.startsWith("/forgot-password");
  const isAuthRoute =
    isLoginRoute || isInviteFlowRoute || isPasswordRecoveryRoute;

  const baseUrl = request.nextUrl.origin;

  if (user?.app_metadata?.account_active === false) {
    await supabase.auth.signOut({ scope: "local" });
    const url = new URL("/login?error=account_deactivated", baseUrl);
    return NextResponse.redirect(url);
  }

  if (!user && !isAuthRoute) {
    const url = new URL("/login", baseUrl);
    return NextResponse.redirect(url);
  }

  // Keep login guest-only, but allow authenticated users to complete
  // invite/recovery flows on /invite-accept and /confirm.
  if (user && isLoginRoute) {
    const url = new URL("/dashboard", baseUrl);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
