import { SITE_URL } from "@/lib/site-config";

/**
 * Cross-site request forgery guard for the API. Another site can make a
 * signed-in person's browser send a request here; the session cookie is
 * SameSite=Lax, so browsers already leave it off cross-site POSTs, and this
 * refuses such a request outright as well: any request that changes something
 * must come from this site's own pages.
 *
 * Browsers name the page a request came from in Origin (and Sec-Fetch-Site).
 * A request without either did not come from a browser page, so it carries no
 * one's cookies by accident and is left to the route's own checks.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split(",")[0].trim().toLowerCase() || null;
}

export function isCrossSiteWrite(input: {
  method: string;
  origin: string | null;
  secFetchSite: string | null;
  /** The Host and X-Forwarded-Host headers the request arrived with. */
  hosts: (string | null | undefined)[];
  siteUrl?: string;
}): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return false;

  if (input.origin) {
    let originHost: string;
    try {
      // "null" (sandboxed frames, some redirects) is never this site.
      originHost = new URL(input.origin).host.toLowerCase();
    } catch {
      return true;
    }
    const allowed = new Set(
      [...input.hosts.map(hostOf), new URL(input.siteUrl ?? SITE_URL).host.toLowerCase()]
        .filter((host): host is string => Boolean(host)),
    );
    return !allowed.has(originHost);
  }

  return input.secFetchSite?.toLowerCase() === "cross-site";
}
