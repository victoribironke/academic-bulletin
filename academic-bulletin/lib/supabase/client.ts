import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Always use the current page origin in the browser so auth requests are
  // same-origin (avoids CORS issues when accessed via 127.0.0.1 vs localhost).
  // The env var is only used during SSR when window is not available.
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    (typeof window !== "undefined"
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3300");
      : (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://localhost:3300");

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    "eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlLWxvY2FsIiwgImlhdCI6IDE3ODgzNDQyNDAsICJleHAiOiAzMjUwMzY4MDAwMH0.KVDpu5JE0WzTf5tLvcGl5laDpav_Y3kmRbBCVqF_a2M";

  return createBrowserClient(url, key, {
    cookieOptions: {
      name: "abrms-auth-token",
    },
  });
}