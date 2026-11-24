/**
 * Task T3, section 7.3: who hears from the reminder agent on a given day, and
 * why. Fixed rules, never the AI's judgement:
 *
 * - On track: a short summary every Monday. Keep an eye on it: Monday and
 *   Thursday. At risk: every second working day. Overdue: every working day.
 * - Any status: 7 and 2 days before each checkpoint; 21, 14, 7, 3 and 1 days
 *   before the final date; the morning of the final date.
 * - At most one message per desk per day: everything due that day is merged.
 * - Copies (T4): the supervisor when a desk is still At risk after two
 *   messages, or from the first overdue day; DAP leadership from the third.
 * - Only on working days; nothing in a quiet period (the Christmas break).
 *
 * Pure: the dry run, the daily run and the tests all use it.
 */
import settings from "@/config/agent.config.json";
import {
  type DateKey,
  type WorkingCalendar,
  addDays,
  daysBetween,
  formatLongDate,
  isWorkingDay,
  plural,
  weekdayOf,
  workingDaysBetween,
} from "@/lib/calendar/dates";
import type { DeadlineStatus } from "@/lib/calendar/countdown";

export const AGENT_SETTINGS = settings.agent;

export type DeskDayInput = {
  date: DateKey;
  calendar: WorkingCalendar;
  status: DeadlineStatus;
  checkpoints: { code: string; name: string; dueDate: DateKey }[];
  finalDate: DateKey;
  /** Messages already sent to this desk, newest first. */
  history: { date: DateKey; status: DeadlineStatus }[];
};

export type DeskDecision = {
  write: boolean;
  /** Why it writes today, in words. */
  reasons: string[];
  /** What else to mention (a checkpoint due today). */
  mentions: string[];
  copySupervisor: boolean;
  copyLeadership: boolean;
  /** Why it stays quiet, when it does. */
  quietBecause: string | null;
};

const quiet = (because: string): DeskDecision => ({
  write: false,
  reasons: [],
  mentions: [],
  copySupervisor: false,
  copyLeadership: false,
  quietBecause: because,
});

/** The settings' quiet periods ("2026-12-24..2027-01-03"). */
function inQuietPeriod(date: DateKey): string | null {
  for (const period of AGENT_SETTINGS.quiet.periods) {
    const [from, to] = period.split("..");
    if (date >= from && date <= to) return `the quiet period from ${formatLongDate(from)} to ${formatLongDate(to)}`;
  }
  return null;
}

/** Working days after `from`, up to and including `to`. */
const workingDaysAfter = (from: DateKey, to: DateKey, calendar: WorkingCalendar) =>
  to > from ? workingDaysBetween(addDays(from, 1), to, calendar) : 0;

export function decideForDesk(input: DeskDayInput): DeskDecision {
  const { date, calendar, status } = input;
  const period = inQuietPeriod(date);
  if (period) return quiet(`It is ${period}.`);
  if (!isWorkingDay(date, calendar)) return quiet("It is not a working day.");
  if (input.history[0]?.date === date) return quiet("This desk already had its message today.");

  const reasons: string[] = [];
  const mentions: string[] = [];
  const weekday = weekdayOf(date);

  // Any status: checkpoints and the final date.
  for (const checkpoint of input.checkpoints) {
    if (checkpoint.dueDate >= input.finalDate) continue;
    const days = daysBetween(date, checkpoint.dueDate);
    if (AGENT_SETTINGS.checkpointDaysBefore.includes(days)) reasons.push(`${checkpoint.code} in ${plural(days, "day")}`);
    if (days === 0) mentions.push(`${checkpoint.code} due today`);
  }
  const toFinal = daysBetween(date, input.finalDate);
  if (AGENT_SETTINGS.finalDaysBefore.includes(toFinal)) reasons.push(`final date in ${plural(toFinal, "day")}`);
  if (toFinal === 0) reasons.push("final date today");

  // The status's own rhythm.
  const last = input.history[0];
  if (status === "ON_TRACK" && weekday === "MON") reasons.push("Monday summary");
  if (status === "KEEP_AN_EYE" && (weekday === "MON" || weekday === "THU")) reasons.push(`Keep an eye on it (${weekday === "MON" ? "Monday" : "Thursday"})`);
  if (status === "AT_RISK" && (!last || workingDaysAfter(last.date, date, calendar) >= 2)) reasons.push("At risk (every second working day)");
  const overdueDay = toFinal < 0 ? workingDaysAfter(input.finalDate, date, calendar) : 0;
  if (status === "OVERDUE") reasons.push(`Overdue (working day ${overdueDay})`);

  // Copies (T4).
  let atRiskInARow = 0;
  for (const message of input.history) {
    if (message.status !== "AT_RISK") break;
    atRiskInARow += 1;
  }
  const escalation = AGENT_SETTINGS.escalation;
  const copySupervisor =
    (status === "AT_RISK" && atRiskInARow >= escalation.AT_RISK_afterMessages) ||
    (status === "OVERDUE" && overdueDay >= escalation.OVERDUE_supervisorFromDay);
  const copyLeadership = status === "OVERDUE" && overdueDay >= escalation.OVERDUE_leadershipFromDay;

  if (reasons.length === 0) return quiet("Nothing is due for this desk today.");
  return { write: true, reasons, mentions, copySupervisor, copyLeadership, quietBecause: null };
}

const QUIET_HOURS = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/;

/**
 * Whether a message may go out at this moment (T6): not in the quiet hours
 * (6:00 pm to 8:00 am), the Sabbath (Friday 6:00 pm to Saturday 7:00 pm) or a
 * quiet period. Times are West Africa Time.
 */
export function maySendAt(now: Date): { ok: boolean; because: string | null } {
  const wat = new Date(now.getTime() + 60 * 60 * 1000);
  const minutes = wat.getUTCHours() * 60 + wat.getUTCMinutes();
  const day = wat.getUTCDay(); // 5 Friday, 6 Saturday
  const date = wat.toISOString().slice(0, 10);
  const period = inQuietPeriod(date);
  if (period) return { ok: false, because: `It is ${period}.` };
  if ((day === 5 && minutes >= 18 * 60) || (day === 6 && minutes < 19 * 60)) return { ok: false, because: "It is the Sabbath." };
  const match = AGENT_SETTINGS.quiet.hours.match(QUIET_HOURS);
  if (match) {
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    if (minutes >= start || minutes < end) return { ok: false, because: "It is outside 8:00 am to 6:00 pm." };
  }
  return { ok: true, because: null };
}

/**
 * The daily job is called at 7:00 and at 8:00 am WAT. The agent runs at both;
 * the rest of the day's work (digests, invitations, GRACE backlog, search
 * rebuild) only at the later call, from 7:45 am, so it runs once a day.
 */
export function dailyWorkDue(now: Date): boolean {
  const wat = new Date(now.getTime() + 60 * 60 * 1000);
  return wat.getUTCHours() * 60 + wat.getUTCMinutes() >= 7 * 60 + 45;
}

