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

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === "production" && !process.env.IS_DOCKER
      ? "http://bulletin.babcock.edu.ng"
      : "http://localhost:3300");

  let externalHost = "localhost:3300";
  let externalProto = "http";
  try {
    const parsed = new URL(siteUrl);
    externalHost = parsed.host;
    externalProto = parsed.protocol.replace(":", "");
  } catch {}

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Host: externalHost,
        "X-Forwarded-Host": externalHost,
        "X-Forwarded-Proto": externalProto,
      },
    },
  });
}
