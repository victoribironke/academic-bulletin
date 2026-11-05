import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const nextConfig: NextConfig = {
  // pdfkit reads its built-in font files from disk at runtime, so load it
  // from node_modules instead of bundling it.
  serverExternalPackages: ["pdfkit"],

  // Every response, pages and API alike, carries the security headers.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          development: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
};

export default nextConfig;
