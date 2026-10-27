import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its built-in font files from disk at runtime, so load it
  // from node_modules instead of bundling it.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
