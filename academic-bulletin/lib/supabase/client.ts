import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3300");

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlLWxvY2FsIiwgImlhdCI6IDE3ODgzNDQyNDAsICJleHAiOiAzMjUwMzY4MDAwMH0.KVDpu5JE0WzTf5tLvcGl5laDpav_Y3kmRbBCVqF_a2M";

  return createBrowserClient(url, key, {
    cookieOptions: {
      name: "abrms-auth-token",
    },
  });
}