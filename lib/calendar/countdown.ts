/**
 * The countdown every desk sees (work order task C2):
 *
 *   70 days left · Due Thursday, February 4, 2027, 11:59 pm
 *   Next: CP1 on Friday, December 11, 2026 (15 days) · 44 working days left
 *
 * Days left are the due date minus today, both in West Africa Time. On the
 * due date it reads "Due today at 11:59 pm"; after the deadline, "Overdue by
 * 1 day". An extension replaces the date and says so. Working days count
 * today and the due date, skipping weekends, holidays and the Christmas break.
 */
import {
  type DateKey,
  type WorkingCalendar,
  dateKeyAt,
  daysBetween,
  deadlineInstant,
  formatDueTime,
  formatLongDate,
  plural,
  workingDaysBetween,
} from "@/lib/calendar/dates";

export type DeadlineStatus = "ON_TRACK" | "KEEP_AN_EYE" | "AT_RISK" | "OVERDUE";

/** Words always go with the colour (section 7.1). */
export const DEADLINE_STATUS_LABELS: Record<DeadlineStatus, string> = {
  ON_TRACK: "On track",
  KEEP_AN_EYE: "Keep an eye on it",
  AT_RISK: "At risk",
  OVERDUE: "Overdue",
};

export type CountdownInput = {
  /** What is due, e.g. "Departmental Drafting". */
  label: string;
  dueDate: DateKey;
  dueTime?: string;
  /** Set when an extension moved the date (it takes precedence). */
  extendedTo?: DateKey | null;
  nextCheckpoint?: { code: string; name: string; dueDate: DateKey } | null;
  calendar: WorkingCalendar;
  now: Date;
};

export type Countdown = {
  label: string;
  state: "upcoming" | "due-today" | "overdue";
  /** Days left (upcoming), 0 (due today) or days overdue. */
  days: number;
  headline: string;
  dueLine: string;
  extendedLine: string | null;
  nextLine: string | null;
  workingDaysLeft: number;
  workingDaysLine: string;
  status: DeadlineStatus;
  statusLabel: string;
  dueDate: DateKey;
};

export function buildCountdown(input: CountdownInput): Countdown {
  const dueTime = input.dueTime ?? "23:59";
  const dueDate = input.extendedTo ?? input.dueDate;
  const today = dateKeyAt(input.now);
  const overdue = input.now.getTime() > deadlineInstant(dueDate, dueTime).getTime();
  const dueToday = !overdue && today === dueDate;
  const days = overdue ? Math.max(1, daysBetween(dueDate, today)) : dueToday ? 0 : daysBetween(today, dueDate);
  const workingDaysLeft = overdue ? 0 : workingDaysBetween(today, dueDate, input.calendar);

  const headline = overdue
    ? `Overdue by ${plural(days, "day")}`
    : dueToday
      ? `Due today at ${formatDueTime(dueTime)}`
      : `${plural(days, "day")} left`;

  // Simple rule until desk status (task T2) can weigh the work left.
  const status: DeadlineStatus = overdue ? "OVERDUE" : workingDaysLeft <= 5 ? "KEEP_AN_EYE" : "ON_TRACK";

  let nextLine: string | null = null;
  const next = input.nextCheckpoint;
  if (next && !overdue && next.dueDate >= today && next.dueDate < dueDate) {
    const until = daysBetween(today, next.dueDate);
    nextLine = `Next: ${next.code} on ${formatLongDate(next.dueDate)} (${until === 0 ? "today" : plural(until, "day")})`;
  }

  return {
    label: input.label,
    state: overdue ? "overdue" : dueToday ? "due-today" : "upcoming",
    days,
    headline,
    dueLine: `Due ${formatLongDate(dueDate)}, ${formatDueTime(dueTime)}`,
    extendedLine: input.extendedTo && input.extendedTo !== input.dueDate ? `Extended to ${formatLongDate(input.extendedTo)}` : null,
    nextLine,
    workingDaysLeft,
    workingDaysLine: overdue ? "No working days left" : `${plural(workingDaysLeft, "working day")} left`,
    status,
    statusLabel: DEADLINE_STATUS_LABELS[status],
    dueDate,
  };
}
