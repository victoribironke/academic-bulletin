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

  const rows = await prisma.$queryRaw<(SearchResult & { rank: number })[]>(Prisma.sql`
    SELECT type, id, title, code, secondary, url, rank FROM (
      SELECT entity_type AS type, entity_id AS id, title, code, secondary, url,
        ROW_NUMBER() OVER (
          PARTITION BY entity_type
          ORDER BY
            (code_key = ANY(${exactKeys}::text[])) DESC,
            ${prefix ? Prisma.sql`(code_key LIKE ${`${prefix}%`})` : Prisma.sql`false`} DESC,
            ${tsQuery ? Prisma.sql`(to_tsvector('simple', unaccent(title)) @@ to_tsquery('simple', ${tsQuery}))` : Prisma.sql`false`} DESC,
            ${tsQuery ? Prisma.sql`ts_rank('{0.05, 0.2, 0.5, 1.0}', tsv, to_tsquery('simple', ${tsQuery}))` : Prisma.sql`0`} DESC,
            ${useTypos ? Prisma.sql`word_similarity(${folded}, search_text)` : Prisma.sql`0`} DESC,
            title ASC
        ) AS rank
      FROM search_documents
      WHERE visibility = ANY(${visibilityFor(role)}::text[])
        AND (${Prisma.join(matches, " OR ")})
    ) ranked
    WHERE rank <= ${perGroup}
    ORDER BY rank`);

  const order = Object.keys(SEARCH_SETTINGS.entities);
  const groups = order
    .map((type) => ({
      type,
      label: entityLabel(type),
      results: rows
        .filter((row) => row.type === type)
        .sort((a, b) => Number(a.rank) - Number(b.rank))
        .map(({ rank: _rank, ...result }) => {
          void _rank;
          return result;
        }),
    }))
    .filter((group) => group.results.length > 0);
  // A group holding an exact code match comes first.
  const exact = groups.findIndex((group) => group.results[0]?.code && exactKeys.includes(compactCode(group.results[0].code)));
  if (exact > 0) groups.unshift(...groups.splice(exact, 1));
  return { groups, tookMs: Math.round(performance.now() - started) };
}
