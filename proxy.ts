import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { wwwRedirectTarget } from "@/lib/canonical-host";

/**
 * Sends www visitors to the main address, signed-out visitors to /login,
 * admins who still need an authenticator code to /verify, and signed-in
 * people away from /login. Apart from the www redirect this only steers
 * pages; every API route checks access itself.
 */
export const proxy = auth((request) => {
  const { pathname, search, origin } = request.nextUrl;

  // Before anything else, API routes included: sign-in only works on the
  // main address. 308 keeps the method, so a form post still arrives.
  const wwwTarget = wwwRedirectTarget(
    [request.headers.get("host"), request.headers.get("x-forwarded-host")],
    pathname + search,
  );
  if (wwwTarget) return NextResponse.redirect(wwwTarget, 308);

  // API routes (including Auth.js's own) do their own auth checks.
  if (pathname.startsWith("/api")) return NextResponse.next();

  const signedIn = Boolean(request.auth?.user?.id);
  const isLoginRoute = pathname.startsWith("/login");
  const isVerifyRoute = pathname === "/verify";

  if (!signedIn) {
    return isLoginRoute ? NextResponse.next() : NextResponse.redirect(new URL("/login", origin));
  }

  if (request.auth?.mfa === "pending") {
    if (isVerifyRoute) return NextResponse.next();
    const verify = new URL("/verify", origin);
    if (!isLoginRoute && pathname !== "/") verify.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(verify);
  }

  // Signed-in users have no reason to see the login page. /verify decides
  // for itself from the database, so it's never redirected here.
  if (isLoginRoute) {
    return NextResponse.redirect(new URL("/dashboard", origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
