/**
 * Task B1 (programmes matched to the national curriculum, R1): which NUC
 * CCMAS 2023 programme each Babcock programme follows, from
 * data/ccmas/programme-matches.json.
 *
 * - SAME_NAME: the national programme has the programme's name.
 * - PROPOSED: a national programme suggested for DAP to approve (a close
 *   name, two national programmes for one Babcock programme, or a document
 *   that lists its programmes together).
 * - DISCIPLINE_ONLY: the NUC document is known, the national programme isn't.
 *
 * Nothing PROPOSED is used until DAP approves the list (approvedBy and
 * approvedOn in the file). After that, the national curriculum sync links a
 * national programme's courses to the programme even where the names differ.
 * A whole-document match (Education, Medicine and Dentistry, ...) never links
 * courses on its own: the document doesn't say which course is whose.
 */
import data from "@/data/ccmas/programme-matches.json";

export type NationalMatchStatus = "SAME_NAME" | "PROPOSED" | "DISCIPLINE_ONLY";

export type NationalMatch = {
  code: string;
  name: string;
  /** National programme names as the CCMAS catalogue writes them. */
  national: string[];
  /** The NUC CCMAS document (data/ccmas/sources.json). */
  discipline: string;
  status: NationalMatchStatus;
  wholeDocument: boolean;
  note: string | null;
};

type MatchFile = { approvedBy: string | null; approvedOn: string | null; programmes: NationalMatch[] };

const file = data as MatchFile;

export const NATIONAL_MATCHES: NationalMatch[] = file.programmes;

export function nationalMatchesApproved(): { by: string; on: string } | null {
  return file.approvedBy && file.approvedOn ? { by: file.approvedBy, on: file.approvedOn } : null;
}

export function nationalMatchFor(programmeCode: string | null | undefined): NationalMatch | null {
  if (!programmeCode) return null;
  const code = programmeCode.trim().toUpperCase();
  return NATIONAL_MATCHES.find((match) => match.code === code) ?? null;
}

/** How a match reads on screen and in reports. */
export function nationalMatchText(match: NationalMatch): string {
  if (match.national.length === 0) return `${match.discipline} document; the national programme is for DAP to name`;
  const names = match.national.join(" and ");
  return match.wholeDocument ? `${match.discipline} document (it lists its programmes together)` : `${names} (${match.discipline})`;
}

/**
 * National programme name -> the Babcock programme codes it links to when
 * the names differ. Only approved, specific matches count.
 */
export function approvedNationalLinks(): Map<string, string[]> {
  const links = new Map<string, string[]>();
  if (!nationalMatchesApproved()) return links;
  for (const match of NATIONAL_MATCHES) {
    if (match.status !== "PROPOSED" || match.wholeDocument) continue;
    for (const name of match.national) links.set(name, [...(links.get(name) ?? []), match.code]);
  }
  return links;
}

export function nationalMatchCounts() {
  const counts: Record<NationalMatchStatus, number> = { SAME_NAME: 0, PROPOSED: 0, DISCIPLINE_ONLY: 0 };
  for (const match of NATIONAL_MATCHES) counts[match.status] += 1;
  return { total: NATIONAL_MATCHES.length, ...counts };
}
