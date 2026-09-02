import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const url =
    process.env.INTERNAL_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "http://127.0.0.1:3000";
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlLWxvY2FsIiwgImlhdCI6IDE3ODgzNDQyNDAsICJleHAiOiAzMjUwMzY4MDAwMH0.KVDpu5JE0WzTf5tLvcGl5laDpav_Y3kmRbBCVqF_a2M";

  return createServerClient(url, key, {
    cookieOptions: {
      name: "abrms-auth-token",
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