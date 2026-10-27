import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE_NAME,
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "./config";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookieOptions: {
      name: AUTH_COOKIE_NAME,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Can be ignored if called from a Server Component
        }
      },
    },
  });
}
