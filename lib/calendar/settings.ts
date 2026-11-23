/**
 * Loads a cycle's calendar (task C1) from settings in the shape of work order
 * section 4.6 (data/calendar/2027-2031.json). Running it again replaces the
 * phases, checkpoints, holidays and quiet periods with the file's; it never
 * touches extensions, which DAP grants one by one.
 */
import type { Prisma } from "@prisma/client";
import {
  type DateKey,
  type Weekday,
  CALENDAR_TIME_ZONE,
  DEFAULT_DUE_TIME,
  isDateKey,
  startOfDateInstant,
} from "@/lib/calendar/dates";

export type CalendarSettings = {
  cycle: {
    name: string;
    bulletinPeriod?: string;
    timezone?: string;
    defaultDueTime?: string;
    workingWeek?: Weekday[];
    quietPeriods?: { from: DateKey; to: DateKey; label: string }[];
    quietHours?: Record<string, string>;
    holidays?: { date: DateKey; name: string }[];
  };
  phases: {
    no: number;
    name: string;
    label: string;
    scope: "PROGRAMME" | "CYCLE";
    desk: string;
    opensAt?: DateKey;
    formalOpensAt?: DateKey;
    targetAt?: DateKey;
    dueAt?: DateKey;
    anchor?: string;
    baselineOpensAt?: DateKey;
    baselineDueAt?: DateKey;
    hardStop?: boolean;
  }[];
  checkpoints: {
    phase: number;
    code: string;
    name: string;
    type?: "CHECKPOINT" | "MILESTONE";
    dueAt: DateKey;
    targetAt?: DateKey;
    sections?: number[];
    requires?: string[];
    desks?: string[];
    hardStop?: boolean;
  }[];
};

/** The checkpoint whose date switches "Submit to School" on (task F0). */
export const SUBMISSIONS_OPEN_CHECKPOINT = "SUBMIT_OPEN";

/** Problems with the settings, in words; empty when they can be loaded. */
export function checkCalendarSettings(settings: CalendarSettings): string[] {
  const problems: string[] = [];
  const dates: [string, unknown][] = [];
  for (const phase of settings.phases) {
    for (const key of ["opensAt", "formalOpensAt", "targetAt", "dueAt", "baselineOpensAt", "baselineDueAt"] as const) {
      if (phase[key] !== undefined) dates.push([`Phase ${phase.no} ${key}`, phase[key]]);
    }
  }
  for (const checkpoint of settings.checkpoints) dates.push([`${checkpoint.code} dueAt`, checkpoint.dueAt]);
  for (const holiday of settings.cycle.holidays ?? []) dates.push([`Holiday ${holiday.name}`, holiday.date]);
  for (const period of settings.cycle.quietPeriods ?? []) {
    dates.push([`${period.label} from`, period.from], [`${period.label} to`, period.to]);
  }
  for (const [label, value] of dates) if (!isDateKey(value)) problems.push(`${label} is not a date: ${String(value)}`);

  const numbers = settings.phases.map((phase) => phase.no);
  if (new Set(numbers).size !== numbers.length) problems.push("A phase number is listed twice.");
  const codes = settings.checkpoints.map((checkpoint) => checkpoint.code);
  if (new Set(codes).size !== codes.length) problems.push("A checkpoint code is listed twice.");
  for (const checkpoint of settings.checkpoints) {
    if (!numbers.includes(checkpoint.phase)) problems.push(`${checkpoint.code} names phase ${checkpoint.phase}, which isn't listed.`);
  }
  for (const phase of settings.phases) {
    if (phase.opensAt && phase.dueAt && phase.dueAt < phase.opensAt) problems.push(`Phase ${phase.no} is due before it opens.`);
  }
  return problems;
}

const day = (key: DateKey | undefined) => (key ? new Date(`${key}T00:00:00Z`) : null);

/** Writes the settings onto one cycle. Run inside a transaction. */
export async function applyCalendarSettings(
  tx: Prisma.TransactionClient,
  cycleId: string,
  settings: CalendarSettings,
): Promise<{ phases: number; checkpoints: number; holidays: number; quietPeriods: number }> {
  const problems = checkCalendarSettings(settings);
  if (problems.length > 0) throw new Error(`The calendar can't be loaded: ${problems.join(" ")}`);

  const timezone = settings.cycle.timezone ?? CALENDAR_TIME_ZONE;
  const submitOpen = settings.checkpoints.find((checkpoint) => checkpoint.code === SUBMISSIONS_OPEN_CHECKPOINT);
  await tx.reviewCycle.update({
    where: { id: cycleId },
    data: {
      bulletinPeriod: settings.cycle.bulletinPeriod ?? null,
      timezone,
      defaultDueTime: settings.cycle.defaultDueTime ?? DEFAULT_DUE_TIME,
      workingWeek: settings.cycle.workingWeek ?? ["MON", "TUE", "WED", "THU", "FRI"],
      quietHours: settings.cycle.quietHours ?? undefined,
      // F0: Submit to School switches on at midnight on that date.
      ...(submitOpen && { submissionsOpenAt: startOfDateInstant(submitOpen.dueAt, timezone) }),
    },
  });

  await tx.cyclePhase.deleteMany({ where: { cycleId } });
  await tx.cycleCheckpoint.deleteMany({ where: { cycleId } });
  await tx.cycleHoliday.deleteMany({ where: { cycleId } });
  await tx.cycleQuietPeriod.deleteMany({ where: { cycleId } });

  await tx.cyclePhase.createMany({
    data: settings.phases.map((phase) => ({
      cycleId,
      phase: phase.no,
      name: phase.name,
      label: phase.label,
      scope: phase.scope,
      desk: phase.desk,
      opensAt: day(phase.opensAt),
      formalOpensAt: day(phase.formalOpensAt),
      targetAt: day(phase.targetAt),
      dueAt: day(phase.dueAt),
      anchor: phase.anchor ?? null,
      baselineOpensAt: day(phase.baselineOpensAt),
      baselineDueAt: day(phase.baselineDueAt),
      hardStop: phase.hardStop ?? false,
    })),
  });
  await tx.cycleCheckpoint.createMany({
    data: settings.checkpoints.map((checkpoint) => ({
      cycleId,
      phase: checkpoint.phase,
      code: checkpoint.code,
      name: checkpoint.name,
      type: checkpoint.type ?? "CHECKPOINT",
      dueAt: day(checkpoint.dueAt)!,
      targetAt: day(checkpoint.targetAt),
      sections: checkpoint.sections ?? [],
      requires: checkpoint.requires ?? [],
      desks: checkpoint.desks ?? [],
      hardStop: checkpoint.hardStop ?? false,
    })),
  });
  const holidays = settings.cycle.holidays ?? [];
  await tx.cycleHoliday.createMany({
    data: holidays.map((holiday) => ({ cycleId, date: day(holiday.date)!, name: holiday.name })),
  });
  const quietPeriods = settings.cycle.quietPeriods ?? [];
  await tx.cycleQuietPeriod.createMany({
    data: quietPeriods.map((period) => ({ cycleId, fromDate: day(period.from)!, toDate: day(period.to)!, label: period.label })),
  });

  return {
    phases: settings.phases.length,
    checkpoints: settings.checkpoints.length,
    holidays: holidays.length,
    quietPeriods: quietPeriods.length,
  };
}
