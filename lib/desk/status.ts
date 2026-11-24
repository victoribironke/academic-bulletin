/**
 * Task T2: each desk's status, by the rules in the work order (section 7.2,
 * settings in 7.4), with the reason in words:
 *
 * - Overdue: the deadline has passed.
 * - At risk: at the current pace it would finish after the deadline, or it
 *   missed a checkpoint, or nobody has signed in for 7 days, or it is within 5
 *   working days of the deadline with more than 20% of the work left.
 * - Keep an eye on it: it would finish within 3 working days of the deadline,
 *   or nothing has happened for 5 working days.
 * - On track: otherwise. A desk with nothing left to do is always On track.
 *
 * Pace counts working days only (weekends, holidays and the Christmas break
 * skipped). Pace isn't judged in a phase's first 5 working days, when there
 * is too little to go on. Worked out whenever a page asks, so it is always as
 * of now (and of the test site's pretend clock).
 */
import {
  type DateKey,
  type WorkingCalendar,
  addDays,
  dateKeyAt,
  deadlineInstant,
  formatLongDate,
  plural,
  workingDaysBetween,
} from "@/lib/calendar/dates";
import { DEADLINE_STATUS_LABELS, type DeadlineStatus } from "@/lib/calendar/countdown";

export const STATUS_SETTINGS = {
  onTrackBufferDays: 3,
  inactiveDaysWatch: 5,
  inactiveDaysRisk: 7,
  nearDeadlineDays: 5,
  nearDeadlineRemainingShare: 0.2,
} as const;

export type DeskStatusInput = {
  now: Date;
  calendar: WorkingCalendar;
  /** When the desk's phase opened, and its deadline (with any extension). */
  openedOn: DateKey;
  dueDate: DateKey;
  dueTime?: string;
  /** Share of the work done, 0 to 1 (honest progress, G5). */
  doneShare: number;
  /** Nothing left to do (submitted, or past this desk). */
  finished: boolean;
  lastActivityAt: Date | null;
  /** The latest sign-in of anyone on the desk. */
  lastSignInAt: Date | null;
  /** The earliest checkpoint already due and not met. */
  missedCheckpoint: { code: string; dueDate: DateKey } | null;
};

export type DeskStatus = { status: DeadlineStatus; label: string; reason: string };

const result = (status: DeadlineStatus, reason: string): DeskStatus => ({
  status,
  label: DEADLINE_STATUS_LABELS[status],
  reason: `${DEADLINE_STATUS_LABELS[status]}: ${reason}`,
});

/** Working days after `from` up to and including `to` (0 when to <= from). */
function workingDaysSince(from: DateKey, to: DateKey, calendar: WorkingCalendar): number {
  return to > from ? workingDaysBetween(addDays(from, 1), to, calendar) : 0;
}

export function deskStatus(input: DeskStatusInput): DeskStatus {
  const settings = STATUS_SETTINGS;
  const today = dateKeyAt(input.now);
  if (input.finished || input.doneShare >= 1) return result("ON_TRACK", "nothing left to do.");
  if (input.now.getTime() > deadlineInstant(input.dueDate, input.dueTime).getTime()) {
    return result("OVERDUE", `the deadline was ${formatLongDate(input.dueDate)}.`);
  }
  if (today < input.openedOn) return result("ON_TRACK", `the work opens on ${formatLongDate(input.openedOn)}.`);

  const elapsed = workingDaysBetween(input.openedOn, today, input.calendar);
  const left = workingDaysBetween(today, input.dueDate, input.calendar);
  const remaining = Math.max(0, 1 - input.doneShare);
  const judgePace = elapsed > settings.inactiveDaysWatch;
  const pace = input.doneShare / Math.max(1, elapsed);
  const needed = pace > 0 ? Math.ceil(remaining / pace) : Number.POSITIVE_INFINITY;
  const percentLeft = Math.round(remaining * 100);

  // At risk.
  if (input.missedCheckpoint) {
    return result("AT_RISK", `${input.missedCheckpoint.code} was missed on ${formatLongDate(input.missedCheckpoint.dueDate)}.`);
  }
  if (judgePace && needed > left) {
    return result(
      "AT_RISK",
      pace > 0
        ? `at the current pace it would finish after ${formatLongDate(input.dueDate)} (${plural(needed, "working day")} needed, ${left} left).`
        : `no progress since the work opened, with ${plural(left, "working day")} left.`,
    );
  }
  const signInDays = input.lastSignInAt
    ? Math.floor((input.now.getTime() - input.lastSignInAt.getTime()) / 86_400_000)
    : null;
  const openDays = Math.floor((input.now.getTime() - deadlineInstant(input.openedOn, "00:00").getTime()) / 86_400_000);
  if (signInDays === null ? openDays >= settings.inactiveDaysRisk : signInDays >= settings.inactiveDaysRisk) {
    return result(
      "AT_RISK",
      signInDays === null ? "nobody on the desk has signed in since the work opened." : `nobody has signed in for ${plural(signInDays, "day")}.`,
    );
  }
  if (left <= settings.nearDeadlineDays && remaining > settings.nearDeadlineRemainingShare) {
    return result("AT_RISK", `${plural(left, "working day")} left with ${percentLeft}% of the work to do.`);
  }

  // Keep an eye on it.
  if (judgePace && left - needed < settings.onTrackBufferDays) {
    return result("KEEP_AN_EYE", `at the current pace it would finish only ${plural(Math.max(0, left - needed), "working day")} before the deadline.`);
  }
  const lastActive = input.lastActivityAt ? dateKeyAt(input.lastActivityAt) : input.openedOn;
  const quiet = workingDaysSince(lastActive < input.openedOn ? input.openedOn : lastActive, today, input.calendar);
  if (quiet >= settings.inactiveDaysWatch) {
    return result("KEEP_AN_EYE", `nothing has happened for ${plural(quiet, "working day")}.`);
  }

  return result(
    "ON_TRACK",
    judgePace
      ? `at the current pace it finishes ${plural(left - needed, "working day")} early (${percentLeft}% left).`
      : `${percentLeft}% of the work left, ${plural(left, "working day")} to go.`,
  );
}

const ORDER: DeadlineStatus[] = ["ON_TRACK", "KEEP_AN_EYE", "AT_RISK", "OVERDUE"];

/** The worst of several statuses (a desk with several programmes). */
export function worstStatus<T extends { status: DeadlineStatus }>(items: T[]): T | null {
  return items.reduce<T | null>((worst, item) => (!worst || ORDER.indexOf(item.status) > ORDER.indexOf(worst.status) ? item : worst), null);
}

/**
 * Whether a Head of Department's checkpoint is met (section 4.2): its
 * sections done, and the requirements the app can check today. Checks that
 * come with later releases (lecturers G2, rules V1 to V7 with F1) aren't
 * counted against the desk yet.
 */
export function checkpointMet(
  checkpoint: { sections: number[]; requires: string[] },
  draft: {
    sectionComplete: (number: number) => boolean;
    descriptionsShare: number;
    courseListConfirmed: boolean;
    submitted: boolean;
    graceRunOnAll: boolean;
  },
): boolean {
  const half = checkpoint.requires.includes("COURSE_DETAILS_50_PERCENT");
  for (const section of checkpoint.sections) {
    if (section === 7 && half) continue;
    if (section === 8 && checkpoint.requires.includes("SUBMITTED")) continue;
    if (!draft.sectionComplete(section)) return false;
  }
  for (const requirement of checkpoint.requires) {
    if (requirement === "COURSE_LIST_CONFIRMED" && !draft.courseListConfirmed) return false;
    if (requirement === "COURSE_DETAILS_50_PERCENT" && draft.descriptionsShare < 0.5) return false;
    if (requirement === "ALL_COURSE_DETAILS" && draft.descriptionsShare < 1) return false;
    if (requirement === "GRACE_RUN_ALL" && !draft.graceRunOnAll) return false;
    if (requirement === "SUBMITTED" && !draft.submitted) return false;
  }
  return true;
}
