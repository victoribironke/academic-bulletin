process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function createPrismaClient() {
  // Guard: fail fast with a clear message if DATABASE_URL is missing.
  // Without this, Prisma v7's driver adapter throws a cryptic
  // "Cannot read properties of undefined (reading 'searchParams')" error.
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "[Prisma] DATABASE_URL environment variable is not set. " +
        "Make sure the .env file is present in the standalone directory or " +
        "that PM2 / Apache passes the environment variables to the process."
    );
  }

  // Reuse existing pool if available (important for serverless)
  if (!globalForPrisma.pool) {
    globalForPrisma.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
      // Keep pool small to stay within PgBouncer limits
      max: 5, // Enough concurrency for Docker; stays well under PgBouncer's 15
      idleTimeoutMillis: 10000, // Close idle connections after 10 seconds
      connectionTimeoutMillis: 10000, // Timeout after 10 seconds if can't connect
    });
  }

  const adapter = new PrismaPg(globalForPrisma.pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Cache the client in development AND production for serverless
globalForPrisma.prisma = prisma;

export default prisma;
