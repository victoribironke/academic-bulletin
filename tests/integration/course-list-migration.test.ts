import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { getCourseListState, isNotSwitchedOn } from "@/lib/courses/course-list";

// B10 goes live before its database update runs on a site: until then the
// panel must say "not switched on" instead of failing. Then the migration
// creates the tables, and running it again changes nothing.
describe("the B10 database update", () => {
  it("is reported as not switched on until it runs, and can run twice", async () => {
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "course_change_requests"');
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "course_list_confirmations"');
    const error = await getCourseListState("no-such-draft").then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isNotSwitchedOn(error)).toBe(true);

    const sql = readFileSync("prisma/migrations/20261124140000_course_list_confirmation/migration.sql", "utf8");
    const statements = sql
      .split("\n")
      .filter((line) => !line.startsWith("--"))
      .join("\n")
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(5);
    for (const round of [1, 2]) {
      for (const statement of statements) await prisma.$executeRawUnsafe(statement);
      expect(round).toBeGreaterThan(0);
    }
    expect(await getCourseListState("no-such-draft")).toEqual({ confirmation: null, requests: [] });
  });
});
