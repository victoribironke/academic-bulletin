/**
 * Whose deadline is whose (tasks C2, C3 and the basic "My desk" of T1).
 *
 * - A Head of Department or programme coordinator: Departmental Drafting
 *   (Phase 1) and its checkpoints, CP1 to CP4.
 * - A Dean: School Board Harmonisation (Phase 2) and its checkpoints, plus
 *   the deadline of each programme in the school.
 * - Academic Planning (admins): every phase, with dates and days left.
 *
 * An extension for the person, their department or their programme always
 * takes precedence over the cycle's date.
 */
import type { UserRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { type Countdown, buildCountdown } from "@/lib/calendar/countdown";
import {
  type DateKey,
  type Weekday,
  type WorkingCalendar,
  dateKeyAt,
  daysBetween,
  formatLongDate,
} from "@/lib/calendar/dates";

type PhaseRow = {
  phase: number;
  name: string;
  label: string;
  desk: string;
  scope: string;
  opensAt: DateKey | null;
  formalOpensAt: DateKey | null;
  dueAt: DateKey | null;
  hardStop: boolean;
};

type CheckpointRow = { phase: number; code: string; name: string; type: string; dueAt: DateKey; desks: string[] };

type ExtensionRow = { scope: string; targetId: string; phase: number | null; newDueAt: DateKey };

export type CycleCalendar = {
  cycleId: string;
  cycleName: string;
  dueTime: string;
  calendar: WorkingCalendar;
  phases: PhaseRow[];
  checkpoints: CheckpointRow[];
  extensions: ExtensionRow[];
};

const key = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/** The active cycle's calendar, or null when no cycle has one loaded. */
export async function loadActiveCycleCalendar(): Promise<CycleCalendar | null> {
  const cycle = await prisma.reviewCycle.findFirst({
    where: { isActive: true, phases: { some: {} } },
    orderBy: { startedAt: "desc" },
    include: { phases: true, checkpoints: true, holidays: true, quietPeriods: true, extensions: true },
  });
  if (!cycle || cycle.phases.length === 0) return null;
  return {
    cycleId: cycle.id,
    cycleName: cycle.name,
    dueTime: cycle.defaultDueTime,
    calendar: {
      workingWeek: (cycle.workingWeek.length ? cycle.workingWeek : ["MON", "TUE", "WED", "THU", "FRI"]) as Weekday[],
      holidays: cycle.holidays.map((holiday) => key(holiday.date)!),
      // No working days in a quiet period (the Christmas break, section 4.5).
      breaks: cycle.quietPeriods.map((period) => ({ from: key(period.fromDate)!, to: key(period.toDate)! })),
    },
    phases: cycle.phases
      .map((phase) => ({
        phase: phase.phase,
        name: phase.name,
        label: phase.label,
        desk: phase.desk,
        scope: phase.scope,
        opensAt: key(phase.opensAt ?? phase.baselineOpensAt),
        formalOpensAt: key(phase.formalOpensAt),
        dueAt: key(phase.dueAt ?? phase.baselineDueAt),
        hardStop: phase.hardStop,
      }))
      .sort((a, b) => a.phase - b.phase),
    checkpoints: cycle.checkpoints
      .map((checkpoint) => ({
        phase: checkpoint.phase,
        code: checkpoint.code,
        name: checkpoint.name,
        type: checkpoint.type,
        dueAt: key(checkpoint.dueAt)!,
        desks: checkpoint.desks,
      }))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    extensions: cycle.extensions.map((extension) => ({
      scope: extension.scope,
      targetId: extension.targetId,
      phase: extension.phase,
      newDueAt: key(extension.newDueAt)!,
    })),
  };
}

/** The latest extension of a phase for any of these people or units, if any. */
export function extensionFor(
  calendar: CycleCalendar,
  phase: number,
  targets: { userIds?: string[]; departmentIds?: string[]; programmeIds?: string[] },
): DateKey | null {
  const matches = calendar.extensions.filter(
    (extension) =>
      extension.phase === phase &&
      ((extension.scope === "USER" && targets.userIds?.includes(extension.targetId)) ||
        (extension.scope === "DEPARTMENT" && targets.departmentIds?.includes(extension.targetId)) ||
        (extension.scope === "PROGRAMME" && targets.programmeIds?.includes(extension.targetId))),
  );
  if (matches.length === 0) return null;
  return matches.map((extension) => extension.newDueAt).sort().at(-1)!;
}

/** The phase's countdown, with its next checkpoint and any extension. */
export function phaseCountdown(
  calendar: CycleCalendar,
  phase: number,
  now: Date,
  extendedTo: DateKey | null = null,
  desk?: string,
): Countdown | null {
  const row = calendar.phases.find((item) => item.phase === phase);
  if (!row?.dueAt) return null;
  const today = dateKeyAt(now);
  const next = calendar.checkpoints.find(
    (checkpoint) =>
      checkpoint.phase === phase &&
      checkpoint.dueAt >= today &&
      checkpoint.dueAt < (extendedTo ?? row.dueAt!) &&
      (checkpoint.desks.length === 0 || !desk || checkpoint.desks.includes(desk)),
  );
  return buildCountdown({
    label: row.name,
    dueDate: row.dueAt,
    dueTime: calendar.dueTime,
    extendedTo,
    nextCheckpoint: next
      ? { code: next.type === "MILESTONE" ? next.name : next.code, name: next.name, dueDate: next.dueAt }
      : null,
    calendar: calendar.calendar,
    now,
  });
}

export type DeskUser = {
  id: string;
  role: UserRole;
  departmentId: string | null;
  schoolId: string | null;
  programmeIds: string[];
};

/** The signed-in person's own deadline. */
export function deskCountdown(calendar: CycleCalendar, user: DeskUser, now: Date): Countdown | null {
  if (user.role === "HOD" || user.role === "PROGRAMME_COORDINATOR") {
    const extendedTo = extensionFor(calendar, 1, {
      userIds: [user.id],
      departmentIds: user.departmentId ? [user.departmentId] : [],
      programmeIds: user.programmeIds,
    });
    return phaseCountdown(calendar, 1, now, extendedTo, "HOD");
  }
  if (user.role === "DEAN") {
    const extendedTo = extensionFor(calendar, 2, { userIds: [user.id] });
    return phaseCountdown(calendar, 2, now, extendedTo, "DEAN");
  }
  // Academic Planning: the next phase still to close, across the cycle.
  const today = dateKeyAt(now);
  const current = calendar.phases.find((phase) => phase.dueAt && phase.dueAt >= today);
  return current ? phaseCountdown(calendar, current.phase, now) : null;
}

export type PhaseListRow = {
  phase: number;
  name: string;
  desk: string;
  opens: string | null;
  due: string | null;
  /** Days left, 0 on the due date, negative once it has passed; null with no date. */
  daysLeft: number | null;
  hardStop: boolean;
};

/** Every phase with its dates and days left (DAP's list, task C3). */
export function phaseList(calendar: CycleCalendar, now: Date): PhaseListRow[] {
  const today = dateKeyAt(now);
  return calendar.phases.map((phase) => ({
    phase: phase.phase,
    name: phase.name,
    desk: phase.desk,
    opens: phase.opensAt ? formatLongDate(phase.formalOpensAt ?? phase.opensAt) : null,
    due: phase.dueAt ? formatLongDate(phase.dueAt) : null,
    daysLeft: phase.dueAt ? daysBetween(today, phase.dueAt) : null,
    hardStop: phase.hardStop,
  }));
}
