/**
 * Tasks K1, K3, K6: one search over the search table, grouped by type.
 *
 * Ranking (section 9.1): an exact code first, then codes that start with what
 * was typed, then titles, then text. Words match as prefixes, with synonyms;
 * a typing mistake still finds a title by trigram similarity; accents don't
 * count. Results are limited to what the person may see before they leave
 * the database, 20 per group.
 */
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { SEARCH_SETTINGS, entityLabel } from "@/lib/search/config";
import { compactCode, courseCodeOf, foldText, tsQueryOf, unitCodeFor } from "@/lib/search/normalise";

export type SearchResult = {
  type: string;
  id: string;
  title: string;
  code: string | null;
  secondary: string | null;
  url: string;
};
export type SearchGroup = { type: string; label: string; results: SearchResult[] };

/** Who may see what (K6). Every R1 record type is open to everyone signed in. */
export function visibilityFor(role: string): string[] {
  return ["ALL_SIGNED_IN", ...(role === "ADMIN" || role === "SUPER_ADMIN" ? ["DAP"] : [])];
}

let aliasCache: { at: number; aliases: Record<string, string> } | null = null;

async function unitAliases(): Promise<Record<string, string>> {
  if (aliasCache && Date.now() - aliasCache.at < 5 * 60_000) return aliasCache.aliases;
  const rows = await prisma.codeAlias.findMany({ select: { oldCode: true, newCode: true } });
  aliasCache = { at: Date.now(), aliases: Object.fromEntries(rows.map((row) => [row.oldCode, row.newCode])) };
  return aliasCache.aliases;
}

export async function searchEverything(role: string, rawQuery: string): Promise<{ groups: SearchGroup[]; tookMs: number }> {
  const started = performance.now();
  const query = rawQuery.trim().replace(/\s+/g, " ").slice(0, 100);
  if (query.length < 2) return { groups: [], tookMs: 0 };

  const exactKeys = [courseCodeOf(query), unitCodeFor(query, await unitAliases())].filter((key): key is string => Boolean(key));
  // A code typed whole or in part ("ECO", "eco 1", "SAHS-N") also matches codes that start with it.
  const looksLikeCode = /^[A-Za-z]{2,5}([\s-]*[A-Za-z]{0,5})?[\s-]*\d{0,3}[A-Za-z]?$/.test(query) && !query.includes("  ");
  const prefix = looksLikeCode ? compactCode(query) : "";
  if (looksLikeCode) exactKeys.push(compactCode(query));
  const tsQuery = tsQueryOf(query);
  const folded = foldText(query);
  const useTypos = folded.length >= SEARCH_SETTINGS.limits.minTypoLength;
  const perGroup = SEARCH_SETTINGS.limits.perGroup;

  const matches = [
    Prisma.sql`code_key = ANY(${exactKeys}::text[])`,
    ...(prefix ? [Prisma.sql`code_key LIKE ${`${prefix}%`}`] : []),
    ...(tsQuery ? [Prisma.sql`tsv @@ to_tsquery('simple', ${tsQuery})`] : []),
    ...(useTypos ? [Prisma.sql`${folded} <% search_text`] : []),
  ];

  // One score, so results and groups are ordered the same way: an exact code,
  // then a code that starts with what was typed, then a match in the code or
  // title, then how well the text matches (section 9.1).
  const score = Prisma.sql`(
    (CASE WHEN code_key = ANY(${exactKeys}::text[]) THEN 1000 ELSE 0 END)
    + ${prefix ? Prisma.sql`(CASE WHEN code_key LIKE ${`${prefix}%`} THEN 500 ELSE 0 END)` : Prisma.sql`0`}
    + ${tsQuery ? Prisma.sql`(CASE WHEN to_tsvector('simple', unaccent(coalesce(code, '') || ' ' || title)) @@ to_tsquery('simple', ${tsQuery}) THEN 100 ELSE 0 END)` : Prisma.sql`0`}
    + ${tsQuery ? Prisma.sql`ts_rank('{0.05, 0.2, 0.5, 1.0}', tsv, to_tsquery('simple', ${tsQuery})) * 10` : Prisma.sql`0`}
    + ${useTypos ? Prisma.sql`word_similarity(${folded}, search_text) * 10` : Prisma.sql`0`}
  )`;

  const rows = await prisma.$queryRaw<(SearchResult & { score: number; rank: number })[]>(Prisma.sql`
    SELECT type, id, title, code, secondary, url, score, rank FROM (
      SELECT entity_type AS type, entity_id AS id, title, code, secondary, url, score,
        ROW_NUMBER() OVER (PARTITION BY entity_type ORDER BY score DESC, title ASC) AS rank
      FROM (
        SELECT *, ${score}::float AS score
        FROM search_documents
        WHERE visibility = ANY(${visibilityFor(role)}::text[])
          AND (${Prisma.join(matches, " OR ")})
      ) scored
    ) ranked
    WHERE rank <= ${perGroup}
    ORDER BY rank`);

  const order = Object.keys(SEARCH_SETTINGS.entities);
  const groups = order
    .map((type) => {
      const results = rows.filter((row) => row.type === type).sort((a, b) => Number(a.rank) - Number(b.rank));
      return {
        type,
        label: entityLabel(type),
        best: results.length ? Number(results[0].score) : 0,
        results: results.map(({ score: _score, rank: _rank, ...result }) => {
          void _score;
          void _rank;
          return result;
        }),
      };
    })
    .filter((group) => group.results.length > 0)
    // The group with the best match first; the settings file's order breaks ties.
    .sort((a, b) => b.best - a.best || order.indexOf(a.type) - order.indexOf(b.type))
    .map(({ best: _best, ...group }) => {
      void _best;
      return group;
    });
  return { groups, tookMs: Math.round(performance.now() - started) };
}
