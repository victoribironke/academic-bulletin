import { defineConfig } from "prisma/config";
import "dotenv/config";

// ---- ADD THESE DEBUG LOGS ----
// console.log("--- DEBUG PRISMA ENVIRONMENT ---");
// console.log("process.env.DIRECT_URL:", process.env.DIRECT_URL);
// console.log("process.env.DATABASE_URL:", process.env.DATABASE_URL);
// console.log("--------------------------------");


export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Use process.env instead of the strict env() helper
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
