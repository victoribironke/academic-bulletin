/**
 * Security headers sent on every route (see next.config.ts). The content
 * policy allows only what the app loads: its own scripts, styles and fonts,
 * Supabase for sign-in and data, and photos over HTTPS.
 *
 * Kept free of Next.js imports so next.config.ts can load it and it can be
 * unit tested.
 */

export type SecurityHeader = { key: string; value: string };

export type SecurityHeaderOptions = {
  /** NEXT_PUBLIC_SUPABASE_URL; the browser calls it for sign-in and sessions. */
  supabaseUrl?: string;
  /** `next dev` needs eval for hot reloading; production never allows it. */
  development?: boolean;
};

function originOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({
  supabaseUrl,
  development = false,
}: SecurityHeaderOptions = {}): string {
  const supabase = originOf(supabaseUrl);
  const supabaseSocket = supabase?.replace(/^http/, "ws");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js streams the page with inline scripts, so 'unsafe-inline' stays
    // until the app moves to per-request nonces. No other origin may run code.
    "script-src": ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Photos are served from Supabase Storage; older records may still link to
    // other HTTPS hosts. Tighten to the Supabase origin once those are moved.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...(supabase ? [supabase] : []),
      ...(supabaseSocket ? [supabaseSocket] : []),
    ],
    "frame-src": ["'none'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
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
