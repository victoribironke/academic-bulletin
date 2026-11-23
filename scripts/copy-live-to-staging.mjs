/**
 * Copies the live site's records into the TEST SITE's database (work order
 * task A1), so testers find the same accounts, units and review cycle there.
 *
 *   SOURCE_DATABASE_URL_FILE=<file holding the live URL> \
 *   TARGET_DATABASE_URL_FILE=<file holding the test site URL> \
 *     node scripts/copy-live-to-staging.mjs [--replace]
 *
 * SOURCE_DATABASE_URL / TARGET_DATABASE_URL work too, but files keep the
 * connection strings out of shell history.
 *
 * - The live database is only read: the copy runs in one READ ONLY snapshot.
 * - The test site's tables must already exist (its pre-deploy step,
 *   npm run db:prepare-staging, builds them).
 * - Without --replace it stops if the test site already has users. With
 *   --replace it empties the test site's tables first, inside the same
 *   transaction, so a failed copy leaves the test site as it was.
 * - Short-lived rows (rate-limit counters, two-step checks) are not copied;
 *   with --replace the test site's own are cleared.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const SKIP_TABLES = new Set(["_prisma_migrations", "api_rate_limits", "mfa_verifications"]);
const BATCH_ROWS = 500;

function readUrl(name) {
  const file = process.env[`${name}_FILE`];
  const value = file ? readFileSync(file, "utf8") : process.env[name];
  const url = value?.trim();
  if (!url) {
    console.error(`Set ${name} or ${name}_FILE.`);
    process.exit(1);
  }
  return url;
}

function describe(url) {
  const u = new URL(url);
  return `${u.hostname}:${u.port || 5432}${u.pathname}`;
}

const sourceUrl = readUrl("SOURCE_DATABASE_URL");
const targetUrl = readUrl("TARGET_DATABASE_URL");
const replace = process.argv.includes("--replace");

if (describe(sourceUrl) === describe(targetUrl)) {
  console.error("Refusing to run: the source and the test site are the same database.");
  process.exit(1);
}

// Every value travels as Postgres text, so dates, JSON, arrays and enums
// arrive exactly as they were stored.
const asText = { getTypeParser: () => (value) => value };
const ssl = (url) =>
  /localhost|127\.0\.0\.1/.test(new URL(url).hostname) ? false : { rejectUnauthorized: false };
const source = new pg.Client({ connectionString: sourceUrl, types: asText, ssl: ssl(sourceUrl) });
const target = new pg.Client({ connectionString: targetUrl, types: asText, ssl: ssl(targetUrl) });

async function columnsByTable(client) {
  const { rows } = await client.query(`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.is_generated = 'NEVER'
    ORDER BY c.table_name, c.ordinal_position`);
  const map = new Map();
  for (const { table_name, column_name } of rows) {
    if (!map.has(table_name)) map.set(table_name, []);
    map.get(table_name).push(column_name);
  }
  return map;
}

const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

await source.connect();
await target.connect();
try {
  console.log(`Source (read only): ${describe(sourceUrl)}`);
  console.log(`Test site:          ${describe(targetUrl)}`);

  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");

  const sourceColumns = await columnsByTable(source);
  const targetColumns = await columnsByTable(target);
  if (!targetColumns.has("users")) {
    throw new Error("The test site has no tables yet. Deploy it first so db:prepare-staging builds them.");
  }

  const tables = [...targetColumns.keys()].filter((t) => !SKIP_TABLES.has(t) && sourceColumns.has(t));
  const onlyInSource = [...sourceColumns.keys()].filter((t) => !SKIP_TABLES.has(t) && !targetColumns.has(t));
  if (onlyInSource.length) console.warn(`Not on the test site, skipped: ${onlyInSource.join(", ")}`);

  await target.query("BEGIN");
  // Skip foreign-key and ledger triggers while loading; the rows already
  // satisfied them on the live site.
  await target.query("SET LOCAL session_replication_role = replica");

  const { rows: userCount } = await target.query(`SELECT count(*)::int AS n FROM "users"`);
  if (Number(userCount[0].n) > 0 && !replace) {
    throw new Error(`The test site already has ${userCount[0].n} users. Run again with --replace to overwrite it.`);
  }
  if (replace) {
    // Every test-site table, the short-lived ones too, so no foreign key
    // is left pointing at an emptied table.
    const all = [...targetColumns.keys()].filter((t) => t !== "_prisma_migrations");
    await target.query(`TRUNCATE ${all.map(quote).join(", ")}`);
  }

  const summary = [];
  for (const table of tables) {
    const wanted = new Set(targetColumns.get(table));
    const columns = sourceColumns.get(table).filter((c) => wanted.has(c));
    const missing = targetColumns.get(table).filter((c) => !sourceColumns.get(table).includes(c));
    if (missing.length) console.warn(`${table}: test site columns not on the source, left to defaults: ${missing.join(", ")}`);

    const { rows } = await source.query({
      text: `SELECT ${columns.map(quote).join(", ")} FROM ${quote(table)}`,
      rowMode: "array",
    });
    for (let start = 0; start < rows.length; start += BATCH_ROWS) {
      const batch = rows.slice(start, start + BATCH_ROWS);
      const params = [];
      const tuples = batch.map((row) => {
        const slots = row.map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        return `(${slots.join(", ")})`;
      });
      await target.query(
        `INSERT INTO ${quote(table)} (${columns.map(quote).join(", ")}) VALUES ${tuples.join(", ")}`,
        params,
      );
    }
    const { rows: check } = await target.query(`SELECT count(*)::int AS n FROM ${quote(table)}`);
    if (Number(check[0].n) !== rows.length) {
      throw new Error(`${table}: copied ${rows.length} rows but the test site holds ${check[0].n}.`);
    }
    summary.push([table, rows.length]);
  }

  await target.query("COMMIT");
  await source.query("COMMIT");
  for (const [table, count] of summary) console.log(`  ${table.padEnd(32)} ${count}`);
  console.log(`Copied ${summary.length} tables into the test site.`);
} catch (error) {
  await target.query("ROLLBACK").catch(() => {});
  await source.query("ROLLBACK").catch(() => {});
  console.error(`Copy stopped, the test site is unchanged: ${error.message}`);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.end();
}
