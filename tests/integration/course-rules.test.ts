import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client as PgClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Task B13: the database itself holds the units and semester rules, so no
// route or script can store a course outside them.

const migration = readFileSync(
  join(process.cwd(), "prisma/migrations/20261123150000_sessional_courses_and_unit_range/migration.sql"),
  "utf8",
);

describe("course rules in the database (B13)", () => {
  const client = new PgClient({ connectionString: process.env.DATABASE_URL });
  const insert = (code: string, units: number, semester: number | null) =>
    client.query(
      `INSERT INTO "master_courses" ("id", "code", "title", "units", "level", "semester", "updatedAt")
       VALUES ($1, $1, 'B13 test course', $2, 100, $3, now())`,
      [code, units, semester],
    );

  beforeAll(async () => {
    await client.connect();
    await client.query(migration);
    // Safe to run again, as the live database needs.
    await client.query(migration);
  });

  afterAll(async () => {
    await client.query(`DELETE FROM "master_courses" WHERE "code" LIKE 'B13T %'`);
    await client.end();
  });

  it("accepts 0 units, 12 units and a course with no semester", async () => {
    await insert("B13T 011", 0, 1);
    await insert("B13T 416", 12, 2);
    await insert("B13T 223", 3, null);
    const { rows } = await client.query(
      `SELECT "code", "units", "semester" FROM "master_courses" WHERE "code" LIKE 'B13T %' ORDER BY "code"`,
    );
    expect(rows).toEqual([
      { code: "B13T 011", units: 0, semester: 1 },
      { code: "B13T 223", units: 3, semester: null },
      { code: "B13T 416", units: 12, semester: 2 },
    ]);
  });

  it("refuses units outside 0 to 12 and a semester other than 1 or 2", async () => {
    await expect(insert("B13T 999", 13, 1)).rejects.toThrow(/master_courses_units_range/);
    await expect(insert("B13T 998", -1, 1)).rejects.toThrow(/master_courses_units_range/);
    await expect(insert("B13T 997", 3, 3)).rejects.toThrow(/master_courses_semester_value/);
  });

  it("puts the same rules on programme course rows", async () => {
    const { rows } = await client.query(
      `SELECT conname FROM pg_constraint WHERE conname IN ('courses_units_range', 'courses_semester_value') ORDER BY conname`,
    );
    expect(rows.map((row) => row.conname)).toEqual(["courses_semester_value", "courses_units_range"]);
    const { rows: nullable } = await client.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'semester'`,
    );
    expect(nullable[0].is_nullable).toBe("YES");
  });
});
