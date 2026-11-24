/**
 * The test site's pretend clock: the cookie it lives in and how its value is
 * read. Shared by the server (lib/clock.ts) and the TEST SITE banner, so it
 * has no server-only imports.
 */

export const PRETEND_NOW_COOKIE = "abrs-pretend-now";

/** The pretend clock only accepts dates within the bulletin cycle and its run-up. */
const EARLIEST = Date.UTC(2026, 0, 1);
const LATEST = Date.UTC(2032, 0, 1);

/** The pretend instant from the cookie's value, or null when it is missing or not a sensible date. */
export function parsePretendNow(value: string | null | undefined): Date | null {
  if (!value) return null;
  let text: string;
  try {
    text = decodeURIComponent(value).trim();
  } catch {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null;
  const date = new Date(text);
  const time = date.getTime();
  return Number.isNaN(time) || time < EARLIEST || time >= LATEST ? null : date;
}

/** A date and time typed in West Africa Time ("2027-02-04T23:58") as the cookie's value, or null. */
export function pretendNowFromWat(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.trim())) return null;
  return parsePretendNow(`${value.trim()}:00+01:00`)?.toISOString() ?? null;
}
