/**
 * Security headers sent on every route (see next.config.ts). The content
 * policy allows only what the app loads: its own scripts, styles, fonts and
 * data, and photos over HTTPS. Sign-in leaves for Google's sign-in page.
 *
 * Kept free of Next.js imports so next.config.ts can load it and it can be
 * unit tested.
 */

export type SecurityHeader = { key: string; value: string };

export type SecurityHeaderOptions = {
  /** `next dev` needs eval for hot reloading; production never allows it. */
  development?: boolean;
};

/** Google's sign-in page, where the sign-in form sends people. */
export const GOOGLE_SIGN_IN_ORIGIN = "https://accounts.google.com";

export function contentSecurityPolicy({
  development = false,
}: SecurityHeaderOptions = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js streams the page with inline scripts, so 'unsafe-inline' stays
    // until the app moves to per-request nonces. No other origin may run code.
    "script-src": ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Photos are served by the app (/api/files); older records may still link
    // to other HTTPS hosts.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", GOOGLE_SIGN_IN_ORIGIN],
  };

  const policy = Object.entries(directives).map(
    ([name, sources]) => `${name} ${sources.join(" ")}`,
  );
  // Local development runs over plain HTTP.
  if (!development) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions = {}): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // For browsers that predate frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
  ];
}

/** The headers every response must carry; used by the header scan. */
export const REQUIRED_SECURITY_HEADERS = securityHeaders().map((header) => header.key);
