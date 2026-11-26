import pg from "pg";
import { readFileSync } from "node:fs";
const url = readFileSync(process.env.URL_FILE, "utf8").trim();
if (new URL(url).hostname !== process.env.EXPECT_HOST) throw new Error("wrong database");
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
const dupes = await c.query(`SELECT upper(regexp_replace(code, '[[:space:]-]+', '', 'g')) k, count(*)::int n FROM master_courses GROUP BY 1 HAVING count(*) > 1`);
console.log("codes still shared:", dupes.rows.length);
if (process.argv.includes("--apply") && dupes.rows.length === 0) {
  const sql = readFileSync("prisma/migrations/20261124130000_course_code_unique/migration.sql", "utf8").split("\n").filter((l) => !l.startsWith("--")).join("\n");
  await c.query(sql);
  const idx = await c.query(`SELECT indexname FROM pg_indexes WHERE indexname = 'master_courses_code_compact_key'`);
  console.log("rule in place:", idx.rows.length === 1);
}
await c.end();
