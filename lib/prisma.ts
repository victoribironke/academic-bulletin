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
        "Set it in .env locally or in the Railway service's variables."
    );
  }

  // Reuse existing pool if available (important for serverless)
  if (!globalForPrisma.pool) {
    globalForPrisma.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Railway's public Postgres endpoint uses SSL with a self-signed certificate.
      ssl: {
        rejectUnauthorized: false,
      },
      // Railway runs one long-lived server, so connections are kept warm
      // (task S1): a request after a quiet spell no longer pays for a new
      // encrypted connection. Well under Postgres's limit of 100.
      max: 10,
      idleTimeoutMillis: 5 * 60_000, // Close idle connections after 5 minutes
      keepAlive: true,
      connectionTimeoutMillis: 10000, // Timeout after 10 seconds if can't connect
    });
    // When Postgres restarts (a backup restore, task O3, or maintenance) it
    // closes idle connections. The pool drops them and opens new ones on the
    // next query; without a listener Node would treat the error as fatal and
    // stop the site.
    globalForPrisma.pool.on("error", (error) => {
      console.error("[Prisma] An idle database connection closed:", error.message);
    });
  }

  const adapter = new PrismaPg(globalForPrisma.pool);
  // The encrypted authenticator secret is left out of every user query, so
  // no API response can carry it; lib/mfa selects it by name when needed.
  // (Typed as a plain client so transaction clients stay interchangeable.)
  return new PrismaClient({
    adapter,
    omit: { user: { mfaSecret: true } },
  }) as unknown as PrismaClient;
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
