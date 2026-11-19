import { NextResponse } from "next/server";
import { auth } from "@/auth";

/** Sends signed-out visitors to /login and signed-in ones away from it. */
export const proxy = auth((request) => {
  const { pathname, origin } = request.nextUrl;

  // API routes (including Auth.js's own) do their own auth checks.
  if (pathname.startsWith("/api")) return NextResponse.next();

  const signedIn = Boolean(request.auth?.user?.id);
  const isLoginRoute = pathname.startsWith("/login");

  if (!signedIn && !isLoginRoute) {
    return NextResponse.redirect(new URL("/login", origin));
  }
  // Signed-in users have no reason to see the login page.
  if (signedIn && isLoginRoute) {
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
