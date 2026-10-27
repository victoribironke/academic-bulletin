import { createBrowserClient } from "@supabase/ssr";
import {
  AUTH_COOKIE_NAME,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "./config";

export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookieOptions: {
      name: AUTH_COOKIE_NAME,
    },
  });
}
