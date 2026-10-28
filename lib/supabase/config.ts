import { SITE_URL } from "@/lib/site-config";

/** Shared Supabase settings. */

export const AUTH_COOKIE_NAME = "abrms-auth-token";

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return url;
}

export function getSupabasePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY is not configured",
    );
  }
  return key;
}

/**
 * Address of the site, used in emails. Local development links point at
 * localhost; everything else uses SITE_URL from lib/site-config.ts.
 */
export function getSiteUrl(): string {
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return SITE_URL.replace(/\/$/, "");
}
