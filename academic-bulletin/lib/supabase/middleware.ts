import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Immediately bypass middleware for internal proxy endpoints & API routes
  if (
    pathname.startsWith("/auth/v1") ||
    pathname.startsWith("/storage/v1") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.INTERNAL_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "http://127.0.0.1:3000",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
      "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlLWxvY2FsIiwgImlhdCI6IDE3ODgzNDQyNDAsICJleHAiOiAzMjUwMzY4MDAwMH0.KVDpu5JE0WzTf5tLvcGl5laDpav_Y3kmRbBCVqF_a2M",
    {
      cookieOptions: {
        name: "abrms-auth-token",
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
    pathname.startsWith("/confirm") || pathname.startsWith("/invite-accept");
  const isPasswordRecoveryRoute = pathname.startsWith("/forgot-password");
  const isAuthRoute =
    isLoginRoute || isInviteFlowRoute || isPasswordRecoveryRoute;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Keep login guest-only, but allow authenticated users to complete
  // invite/recovery flows on /invite-accept and /confirm.
  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
