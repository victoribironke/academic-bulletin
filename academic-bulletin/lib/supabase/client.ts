import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  // Defensive check to prevent compilation crashes during Next.js build
  if (!url || !key) {
    console.warn("Supabase client environment variables are missing during compile/build.");
    return null as unknown as ReturnType<typeof createBrowserClient>;
  }

  return createBrowserClient(url, key);
}