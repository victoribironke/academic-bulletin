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
  // Google sends users back here before they have a session.
  const isAuthRoute = isLoginRoute || pathname.startsWith("/auth/callback");

  // Redirects must carry any cookies Supabase just set (e.g. a sign-out).
  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  if (user?.app_metadata?.account_active === false) {
    await supabase.auth.signOut({ scope: "local" });
    return redirectTo("/login?error=account_deactivated");
  }

  if (!user && !isAuthRoute) {
    return redirectTo("/login");
  }

  // Signed-in users have no reason to see the login page.
  if (user && isLoginRoute) {
    return redirectTo("/dashboard");
  }

  return supabaseResponse;
}
