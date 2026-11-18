import { SITE_URL } from "@/lib/site-config";

/**
 * Address of the site, used in emails. Local development links point at
 * localhost; everything else uses SITE_URL from lib/site-config.ts.
 */
export function getSiteUrl(): string {
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return SITE_URL.replace(/\/$/, "");
}
