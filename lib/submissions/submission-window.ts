import { calendarNow } from "@/lib/clock";
import prisma from "@/lib/prisma";

/**
 * "Submit to School" stays off until a cycle's submissions open (work order
 * task F0): for the 2027-2031 cycle, Monday, December 14, 2026, so the checks
 * that come with R2 are live before anything reaches a Dean. Heads keep
 * drafting meanwhile. The date lives on the cycle (`submissionsOpenAt`); a
 * cycle without one has no such limit. DAP opens submissions earlier by
 * moving the date.
 *
 * Only the first Submit (Phase 1, Departmental Drafting) waits; returning a
 * revised programme later is never held back.
 */

/** The phase whose Submit waits for the date. */
export const SUBMISSION_WINDOW_PHASE = 1;

/** "Monday, December 14, 2026", in West Africa Time. */
export function formatOpeningDate(opensAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(opensAt);
}

export function submissionsClosedMessage(opensAt: Date): string {
  return `Submissions open on ${formatOpeningDate(opensAt)}. Keep working; your draft saves as you go.`;
}

export type SubmissionWindow =
  | { open: true }
  | { open: false; opensAt: string; message: string };

export function submissionWindow(
  submissionsOpenAt: Date | null | undefined,
  currentPhase: number,
  now: Date = new Date(),
): SubmissionWindow {
  if (currentPhase !== SUBMISSION_WINDOW_PHASE || !submissionsOpenAt) return { open: true };
  if (now.getTime() >= submissionsOpenAt.getTime()) return { open: true };
  return {
    open: false,
    opensAt: submissionsOpenAt.toISOString(),
    message: submissionsClosedMessage(submissionsOpenAt),
  };
}

/** The window for one submission, read from its cycle (by default as of the test site's pretend clock, if set). */
export async function getSubmissionWindow(
  submissionId: string,
  now?: Date,
): Promise<SubmissionWindow> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { currentPhase: true, cycle: { select: { submissionsOpenAt: true } } },
  });
  if (!submission) return { open: true };
  return submissionWindow(submission.cycle?.submissionsOpenAt, submission.currentPhase, now ?? (await calendarNow()));
}

/**
 * Reads a submissions-open date from a request body: an ISO date-time,
 * or null to remove the limit. Returns undefined when absent and an error
 * message when unreadable.
 */
export function parseSubmissionsOpenAt(
  value: unknown,
): { ok: true; value: Date | null | undefined } | { ok: false; message: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: "submissionsOpenAt must be a date or null." };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { ok: false, message: "submissionsOpenAt is not a valid date." };
  return { ok: true, value: date };
}
