import { describe, expect, it, vi } from "vitest";
import prisma from "@/lib/prisma";

// Task O3: a Postgres restart (backup restore) must not stop the site.

describe("the database connection pool", () => {
  it("survives Postgres closing an idle connection", () => {
    void prisma.$connect; // creates the client and its pool
    const pool = (globalThis as unknown as { pool?: { emit: (event: string, error: Error) => boolean; listenerCount: (event: string) => number } }).pool;
    expect(pool).toBeDefined();
    expect(pool!.listenerCount("error")).toBeGreaterThan(0);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => pool!.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();
    expect(logged).toHaveBeenCalledWith(
      "[Prisma] An idle database connection closed:",
      "terminating connection due to administrator command",
    );
    logged.mockRestore();
  });
});
