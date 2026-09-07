import type { NextConfig } from "next";

const authTarget =
  process.env.GOTRUE_INTERNAL_URL ||
  (process.env.DOCKER_ENV === "true" || process.env.IS_DOCKER === "true"
    ? "http://auth:9999"
    : "http://127.0.0.1:9999");

const storageTarget =
  process.env.STORAGE_INTERNAL_URL ||
  (process.env.DOCKER_ENV === "true" || process.env.IS_DOCKER === "true"
    ? "http://storage:5000"
    : "http://127.0.0.1:5000");

const nextConfig: NextConfig = {
  output: "standalone",

  // ── Auth & Storage Rewrites ───────────────────────────────────────────────
  // In DEVELOPMENT (Docker), rewrites proxy to GoTrue & Storage on the Docker network.
  // In PRODUCTION (bare-metal), rewrites proxy to local systemd units (127.0.0.1).
  async rewrites() {
    return [
      {
        source: "/auth/v1/:path*",
        destination: `${authTarget}/:path*`,
      },
      {
        source: "/storage/v1/:path*",
        destination: `${storageTarget}/:path*`,
      },
    ];
  },
};

export default nextConfig;
