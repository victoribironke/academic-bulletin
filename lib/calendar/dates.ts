/**
 * Calendar dates for deadlines and countdowns (work order section 4, tasks
 * C1 and C2). Everything is worked out in West Africa Time, whatever time
 * zone the server runs in. A date is a "YYYY-MM-DD" key in that zone.
 */

/** West Africa Time: UTC+1 all year, no daylight saving. */
export const CALENDAR_TIME_ZONE = "Africa/Lagos";
export const DEFAULT_DUE_TIME = "23:59";

export type DateKey = string;
export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
export const DEFAULT_WORKING_WEEK: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];

export type WorkingCalendar = {
  workingWeek: Weekday[];
  /** Public holidays (dates). */
  holidays: DateKey[];
  /** Breaks with no working days, inclusive (the Christmas break). */
  breaks: { from: DateKey; to: DateKey }[];
};

const KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== "string" || !KEY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The calendar date of an instant in West Africa Time. */
export function dateKeyAt(instant: Date, timeZone: string = CALENDAR_TIME_ZONE): DateKey {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function toUtcDay(key: DateKey): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function fromUtcDay(day: number): DateKey {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function addDays(key: DateKey, days: number): DateKey {
  return fromUtcDay(toUtcDay(key) + days);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: DateKey, to: DateKey): number {
  return toUtcDay(to) - toUtcDay(from);
}

export function weekdayOf(key: DateKey): Weekday {
  return (["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const)[new Date(toUtcDay(key) * 86_400_000).getUTCDay()];
}

/** The UTC offset of a time zone at an instant, in minutes (WAT: +60). */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The last moment of a deadline: the end of the due minute on the due date
 * ("11:59 pm" means up to 11:59:59 pm), in the calendar's time zone.
 */
export function deadlineInstant(
  key: DateKey,
  dueTime: string = DEFAULT_DUE_TIME,
  timeZone: string = CALENDAR_TIME_ZONE,
): Date {
  const [hours, minutes] = dueTime.split(":").map(Number);
  const [y, m, d] = key.split("-").map(Number);
  const wallClockAsUtc = Date.UTC(y, m - 1, d, hours, minutes, 59, 999);
  return new Date(wallClockAsUtc - offsetMinutes(new Date(wallClockAsUtc), timeZone) * 60_000);
}

/** The first moment of a date in the calendar's time zone (midnight). */
export function startOfDateInstant(key: DateKey, timeZone: string = CALENDAR_TIME_ZONE): Date {
  const [y, m, d] = key.split("-").map(Number);
  const wallClockAsUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  return new Date(wallClockAsUtc - offsetMinutes(new Date(wallClockAsUtc), timeZone) * 60_000);
}

export function isWorkingDay(key: DateKey, calendar: WorkingCalendar): boolean {
  if (!calendar.workingWeek.includes(weekdayOf(key))) return false;
  if (calendar.holidays.includes(key)) return false;
  return !calendar.breaks.some((range) => key >= range.from && key <= range.to);
}

/** Working days from `from` to `to`, both included (0 when `to` is earlier). */
export function workingDaysBetween(from: DateKey, to: DateKey, calendar: WorkingCalendar): number {
  let count = 0;
  for (let key = from; key <= to; key = addDays(key, 1)) {
    if (isWorkingDay(key, calendar)) count += 1;
  }
  return count;
}

/** "Thursday, February 4, 2027". */
export function formatLongDate(key: DateKey): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(toUtcDay(key) * 86_400_000));
}

/** "23:59" -> "11:59 pm". */
export function formatDueTime(dueTime: string = DEFAULT_DUE_TIME): string {
  const [hours, minutes] = dueTime.split(":").map(Number);
  const suffix = hours >= 12 ? "pm" : "am";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
