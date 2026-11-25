/**
 * Task H8: clinics, worked out without a database. DAP runs two 30-minute
 * online clinics a week for Heads of Department until Friday, January 29,
 * 2027. Each clinic is a weekly slot (a day, a start time, a length and a
 * joining link); the home page shows its next sessions. No clinic falls on a
 * holiday or in a quiet period (the Christmas break), and none on the
 * Sabbath (Friday evening to Saturday evening).
 */
import {
  addDays,
  dateKeyAt,
  formatDueTime,
  formatLongDate,
  isDateKey,
  startOfDateInstant,
  weekdayOf,
  type DateKey,
  type Weekday,
} from "@/lib/calendar/dates";

/** Work order task H8: the clinics run until Friday, January 29, 2027. */
export const CLINICS_END: DateKey = "2027-01-29";
export const CLINIC_MINUTES = 30;
export const CLINIC_TITLE = "Clinic for Heads of Department";
/** Every day but Saturday, the Sabbath. */
export const CLINIC_WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SUN"];
/** The Sabbath starts on Friday evening (the calendar's quiet hours). */
const FRIDAY_LAST_END = "18:00";
/** How far ahead the home page looks: far enough to see past the Christmas break. */
const LOOK_AHEAD_DAYS = 42;
/** A session is "starting soon" this long before it starts. */
const SOON_MINUTES = 15;

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};
const WEEKDAY_ORDER: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export type ClinicSlot = {
  id: string;
  weekday: Weekday;
  /** "HH:MM", West Africa Time. */
  startTime: string;
  minutes: number;
  title: string;
  joinUrl: string;
  untilDate: DateKey;
};

export type ClinicDaysOff = { holidays: DateKey[]; breaks: { from: DateKey; to: DateKey }[] };

export type ClinicSession = {
  clinicId: string;
  title: string;
  joinUrl: string;
  date: DateKey;
  startsAt: string;
  endsAt: string;
  /** "Today", "Tomorrow" or "Tuesday, December 1". */
  day: string;
  /** "2:00 pm to 2:30 pm". */
  time: string;
  status: "ON_NOW" | "SOON" | "LATER";
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
const fromMinutes = (total: number) =>
  `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

/** "2:00 pm to 2:30 pm". */
export function clinicTime(startTime: string, minutes: number): string {
  return `${formatDueTime(startTime)} to ${formatDueTime(fromMinutes(toMinutes(startTime) + minutes))}`;
}

/** "Every Tuesday, 2:00 pm to 2:30 pm". */
export function describeClinic(slot: Pick<ClinicSlot, "weekday" | "startTime" | "minutes">): string {
  return `Every ${WEEKDAY_NAMES[slot.weekday]}, ${clinicTime(slot.startTime, slot.minutes)}`;
}

export function sortClinics<T extends Pick<ClinicSlot, "weekday" | "startTime">>(slots: T[]): T[] {
  return [...slots].sort(
    (a, b) => WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday) || a.startTime.localeCompare(b.startTime),
  );
}

/** When a session starts: the date at the start time, West Africa Time (no daylight saving). */
export function clinicStart(date: DateKey, startTime: string): Date {
  return new Date(startOfDateInstant(date).getTime() + toMinutes(startTime) * 60_000);
}

/** "Tuesday, December 1" (the year only when it isn't this one). */
function dayLabel(date: DateKey, today: DateKey): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  const long = formatLongDate(date);
  return date.slice(0, 4) === today.slice(0, 4) ? long.replace(/, \d{4}$/, "") : long;
}

const isDayOff = (date: DateKey, daysOff: ClinicDaysOff) =>
  daysOff.holidays.includes(date) || daysOff.breaks.some((range) => date >= range.from && date <= range.to);

/** The next sessions of every clinic, soonest first, leaving out holidays and breaks. */
export function clinicSessions(
  slots: ClinicSlot[],
  daysOff: ClinicDaysOff,
  now: Date,
  { limit = 2, days = LOOK_AHEAD_DAYS }: { limit?: number; days?: number } = {},
): ClinicSession[] {
  const today = dateKeyAt(now);
  const sessions: ClinicSession[] = [];
  for (const slot of slots) {
    for (let offset = 0; offset < days; offset += 1) {
      const date = addDays(today, offset);
      if (date > slot.untilDate) break;
      if (weekdayOf(date) !== slot.weekday || isDayOff(date, daysOff)) continue;
      const start = clinicStart(date, slot.startTime);
      const end = new Date(start.getTime() + slot.minutes * 60_000);
      if (end <= now) continue;
      sessions.push({
        clinicId: slot.id,
        title: slot.title,
        joinUrl: slot.joinUrl,
        date,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        day: dayLabel(date, today),
        time: clinicTime(slot.startTime, slot.minutes),
        status: start <= now ? "ON_NOW" : start.getTime() - now.getTime() <= SOON_MINUTES * 60_000 ? "SOON" : "LATER",
      });
    }
  }
  return sessions.sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, limit);
}

/** Only a plain https link opens from the home page. */
export function isSafeJoinUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export type ClinicInput = Omit<ClinicSlot, "id">;

/** Checks what DAP typed for a clinic: the value to save, or what to fix. */
export function readClinicInput(input: Record<string, unknown>, today: DateKey): { value: ClinicInput } | { error: string } {
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 100) : CLINIC_TITLE;
  const weekday = String(input.weekday ?? "").toUpperCase() as Weekday;
  if (weekday === "SAT") return { error: "Saturday is the Sabbath; choose another day." };
  if (!CLINIC_WEEKDAYS.includes(weekday)) return { error: "Choose the day of the week the clinic runs." };
  const startTime = typeof input.startTime === "string" ? input.startTime.trim() : "";
  if (!TIME.test(startTime)) return { error: "Give the start time as hours and minutes, for example 14:00." };
  const minutes = input.minutes === undefined || input.minutes === "" ? CLINIC_MINUTES : Number(input.minutes);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 120) return { error: "A clinic lasts between 15 and 120 minutes." };
  if (toMinutes(startTime) + minutes > 24 * 60) return { error: "The clinic must end on the day it starts." };
  if (weekday === "FRI" && toMinutes(startTime) + minutes > toMinutes(FRIDAY_LAST_END)) {
    return { error: "The Sabbath starts on Friday evening; a Friday clinic must end by 6:00 pm." };
  }
  const joinUrl = typeof input.joinUrl === "string" ? input.joinUrl.trim() : "";
  if (joinUrl.length > 500 || !isSafeJoinUrl(joinUrl)) {
    return { error: "Paste the meeting's joining link; it starts with https://." };
  }
  const untilDate = input.untilDate === undefined || input.untilDate === "" ? CLINICS_END : input.untilDate;
  if (!isDateKey(untilDate)) return { error: "Choose the clinic's last day." };
  if (untilDate < today) return { error: "The last day can't be in the past." };
  return { value: { title, weekday, startTime, minutes, joinUrl, untilDate } };
}
