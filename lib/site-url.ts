import { SITE_URL } from "@/lib/site-config";

/**
 * Address of the site, used in emails. Local development links point at
 * localhost; a deployed copy uses its own AUTH_URL (so the test site links to
 * the test site); otherwise SITE_URL from lib/site-config.ts.
 */
export function getSiteUrl(): string {
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  const own = process.env.AUTH_URL?.trim();
  return (own || SITE_URL).replace(/\/$/, "");
}
