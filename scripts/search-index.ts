/**
 * Builds the search table in full (task K1) and runs a few searches to show
 * it works. Run once after its migration (20261124160000_search_documents) on
 * a database; after that the site keeps the table up to date by itself.
 *
 *   DATABASE_URL_FILE=<file holding the database URL> npx tsx scripts/search-index.ts
 */
import { readFileSync } from "node:fs";

const databaseUrl = (process.env.DATABASE_URL_FILE
  ? readFileSync(process.env.DATABASE_URL_FILE, "utf8")
  : (process.env.DATABASE_URL ?? "")
).trim();
if (!databaseUrl) {
  console.error("Set DATABASE_URL_FILE (or DATABASE_URL).");
  process.exit(1);
}
process.env.DATABASE_URL = databaseUrl;

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { refreshSearchIndex } = await import("../lib/search/sync");
  const { searchEverything } = await import("../lib/search/query");
  try {
    const started = Date.now();
    const { written } = await refreshSearchIndex({ full: true });
    const counts = await prisma.$queryRaw<{ entity_type: string; n: number }[]>`
      SELECT entity_type, count(*)::int AS n FROM search_documents GROUP BY entity_type ORDER BY entity_type`;
    console.log(`Built in ${Math.round((Date.now() - started) / 1000)} s: ${written} records written.`);
    console.log(counts.map((row) => `${row.entity_type}: ${row.n}`).join(", "));
    for (const query of ["eco101", "bu gst 112", "general studies", "introdution", "SEH", "academic load"]) {
      const { groups, tookMs } = await searchEverything("HOD", query);
      const top = groups[0]?.results[0];
      console.log(`"${query}" (${tookMs} ms): ${top ? `${groups[0].label}: ${top.code ? `${top.code} ` : ""}${top.title}` : "nothing"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
