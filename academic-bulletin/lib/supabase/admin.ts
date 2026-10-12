import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const port = process.env.PORT || "3000";
  const url =
    process.env.INTERNAL_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    `http://127.0.0.1:${port}`;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
