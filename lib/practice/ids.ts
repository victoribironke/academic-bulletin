/**
 * Task U6 (practice programme): every id in the practice programme starts
 * with this prefix. The practice API in the browser answers only requests
 * that carry one, and the server has no record with such an id, so a request
 * that slips past it changes nothing.
 */
export const PRACTICE_PREFIX = "practice-run-";

export const PRACTICE_IDS = {
  draft: `${PRACTICE_PREFIX}draft`,
  programme: `${PRACTICE_PREFIX}programme`,
  department: `${PRACTICE_PREFIX}department`,
  school: `${PRACTICE_PREFIX}school`,
  cycle: `${PRACTICE_PREFIX}cycle`,
} as const;

export function isPracticeId(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PRACTICE_PREFIX);
}

/** True when a request's address or JSON body names a practice record. */
export function mentionsPractice(url: string, body: string | null | undefined): boolean {
  return url.includes(PRACTICE_PREFIX) || (typeof body === "string" && body.includes(`"${PRACTICE_PREFIX}`));
}
