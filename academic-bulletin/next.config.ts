import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  // ── Dev-only Auth & Storage Rewrites ────────────────────────────────────────
  // In DEVELOPMENT (Docker), Next.js proxies /auth/v1/* and /storage/v1/* to
  // the self-hosted GoTrue and Storage API containers on the internal Docker
  // network.
  //
  // In PRODUCTION (bare-metal + Apache), Apache intercepts these paths before
  // they reach Next.js, so these rewrites are harmlessly bypassed.
  async rewrites() {
    return [
      {
        source: "/auth/v1/:path*",
        destination: "http://auth:9999/:path*",
      },
      {
        source: "/storage/v1/:path*",
        destination: "http://storage:5000/:path*",
      },
    ];
  },
};

export default nextConfig;
