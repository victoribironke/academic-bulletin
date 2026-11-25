/**
 * Task H8: the clinics card on the Head of Department home page. The next
 * sessions of the active cycle's clinics, with their joining links, until
 * the last clinic day (Friday, January 29, 2027 by default).
 */
import prisma from "@/lib/prisma";
import type { Weekday } from "@/lib/calendar/dates";
import { dateKeyAt } from "@/lib/calendar/dates";
import {
  clinicSessions,
  describeClinic,
  sortClinics,
  type ClinicSession,
  type ClinicSlot,
} from "@/lib/calendar/clinic-sessions";

export type HomeClinics = {
  sessions: ClinicSession[];
  /** "Every Tuesday, 2:00 pm to 2:30 pm", one line per clinic still running. */
  schedule: string[];
  /** The last day any clinic runs. */
  until: string | null;
};

const key = (date: Date) => date.toISOString().slice(0, 10);

export async function clinicsForHome(now: Date): Promise<HomeClinics> {
  const cycle = await prisma.reviewCycle.findFirst({
    where: { isActive: true, archivedAt: null, phases: { some: {} } },
    orderBy: { startedAt: "desc" },
    select: {
      holidays: { select: { date: true } },
      quietPeriods: { select: { fromDate: true, toDate: true } },
      clinics: true,
    },
  });
  if (!cycle) return { sessions: [], schedule: [], until: null };
  const today = dateKeyAt(now);
  const slots: ClinicSlot[] = sortClinics(
    cycle.clinics
      .map((clinic) => ({ ...clinic, weekday: clinic.weekday as Weekday, untilDate: key(clinic.untilDate) }))
      .filter((clinic) => clinic.untilDate >= today),
  );
  const sessions = clinicSessions(
    slots,
    {
      holidays: cycle.holidays.map((holiday) => key(holiday.date)),
      breaks: cycle.quietPeriods.map((period) => ({ from: key(period.fromDate), to: key(period.toDate) })),
    },
    now,
  );
  return {
    sessions,
    schedule: slots.map((slot) => describeClinic(slot)),
    until: slots.length ? slots.map((slot) => slot.untilDate).sort().at(-1)! : null,
  };
}
