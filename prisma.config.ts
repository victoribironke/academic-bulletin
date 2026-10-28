import { defineConfig } from "prisma/config";
import { loadEnvConfig } from "@next/env";

// Load .env.local / .env the same way Next.js does, so the Prisma CLI sees the
// same settings as the app.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // DIRECT_URL (session connection) for schema changes; falls back to DATABASE_URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
  migrations: {
    seed: "bun run prisma/seed.ts",
  },
});
