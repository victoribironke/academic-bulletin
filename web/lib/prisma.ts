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
        "Set it in .env locally or in the Vercel project settings."
    );
  }

  // Reuse existing pool if available (important for serverless)
  if (!globalForPrisma.pool) {
    globalForPrisma.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Supabase requires SSL; its pooler certificate isn't in Node's default CA list.
      ssl: {
        rejectUnauthorized: false,
      },
      // Each serverless instance gets its own small pool; Supabase's pooler
      // (DATABASE_URL, port 6543) shares the real connections between them.
      max: 3,
      idleTimeoutMillis: 10000, // Close idle connections after 10 seconds
      connectionTimeoutMillis: 10000, // Timeout after 10 seconds if can't connect
    });
  }

  const adapter = new PrismaPg(globalForPrisma.pool);
  return new PrismaClient({ adapter });
}

// Lazy singleton — the client is only instantiated on first property access
// (i.e. at request time), NOT at module-import time during `next build`.
// This prevents the "DATABASE_URL is not set" error when Next.js statically
// analyses routes during the build step.
function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default prisma;
