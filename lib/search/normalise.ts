/**
 * Task K3: forgiving matching. "eco101", "ECO-101" and "eco 101" are all
 * ECO 101; "bu eco 125" is BU-ECO 125; old unit codes ("SEH", "SAHS-HND") find
 * the renamed unit; synonyms ("general studies", "GNS") find GST courses.
 * Pure: no database, so the search and the tests share it.
 */
import { SEARCH_SETTINGS } from "@/lib/search/config";

/** Upper case, no spaces or hyphens: "BU-ECO 125" and "bu eco125" are "BUECO125". */
export function compactCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]+/g, "");
}

/** Letters and digits only, lower case, accents folded: "Yorùbá" is "yoruba". */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The course code a query is, if it is one ("eco101" is "ECO101"). */
export function courseCodeOf(query: string): string | null {
  const pattern = new RegExp(SEARCH_SETTINGS.codeNormalisation.pattern);
  const match = query.trim().toUpperCase().replace(/\s+/g, " ").match(pattern);
  if (!match) return null;
  return `${match[1] ? "BU" : ""}${match[2]}${match[3]}`;
}

/** The new code for an old unit code, from the settings file and A5's aliases. */
export function unitCodeFor(query: string, aliases: Record<string, string> = {}): string | null {
  const key = compactCode(query);
  const all: Record<string, string> = { ...SEARCH_SETTINGS.unitCodeAliases, ...aliases };
  for (const [oldCode, newCode] of Object.entries(all)) {
    if (compactCode(oldCode) === key) return compactCode(newCode);
  }
  return null;
}

/** The query and its synonyms, each as folded words. */
export function alternativesOf(query: string): string[][] {
  const folded = foldText(query);
  const alternatives = [folded];
  for (const group of SEARCH_SETTINGS.synonyms) {
    const terms = group.map(foldText);
    const hit = terms.find((term) => term && (folded === term || ` ${folded} `.includes(` ${term} `)));
    if (!hit) continue;
    for (const term of terms) if (term !== hit) alternatives.push(` ${folded} `.replace(` ${hit} `, ` ${term} `).trim());
  }
  return [...new Set(alternatives)].filter(Boolean).map((text) => text.split(" ").slice(0, 8));
}

/**
 * A to_tsquery string: every word as a prefix, words joined by AND, the
 * query and its synonyms joined by OR. Words are letters and digits only, so
 * the string is safe to pass to Postgres.
 */
export function tsQueryOf(query: string): string | null {
  const parts = alternativesOf(query)
    .map((words) => words.filter((word) => /^[a-z0-9]+$/.test(word)).map((word) => `${word}:*`).join(" & "))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map((part) => `(${part})`).join(" | ");
}
