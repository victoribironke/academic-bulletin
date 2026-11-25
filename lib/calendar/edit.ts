/**
 * Task C4: DAP changes a cycle's calendar on screen: phase dates,
 * checkpoints, holidays, quiet periods and quiet hours, and the clinics for
 * Heads of Department (task H8), and grants extensions with a reason. Every change is logged, and the people a date
 * change affects are told by email.
 *
 * Nothing locks at a deadline (task C6, decision DEC10): the desk shows
 * Overdue and DAP can grant an extension here.
 */
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { type DateKey, type Weekday, dateKeyAt, formatLongDate, isDateKey, startOfDateInstant } from "@/lib/calendar/dates";
import { clinicSessions, describeClinic, readClinicInput, sortClinics } from "@/lib/calendar/clinic-sessions";
import { SUBMISSIONS_OPEN_CHECKPOINT } from "@/lib/calendar/settings";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { renderEmail } from "@/lib/email/notifications";
import { getSiteUrl } from "@/lib/site-url";

export const CHANGE_REASON_MIN = 10;

const dateOnly = (key: DateKey) => new Date(`${key}T00:00:00.000Z`);
const keyOf = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export class CalendarEditError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function needReason(reason: unknown): string {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < CHANGE_REASON_MIN) {
    throw new CalendarEditError(`Give a reason of at least ${CHANGE_REASON_MIN} characters; it goes in the log and to the people affected.`);
  }
  return text.slice(0, 500);
}

function needDate(value: unknown, what: string): DateKey {
  if (!isDateKey(value)) throw new CalendarEditError(`Choose ${what}.`);
  return value;
}

/** Everything the calendar screen shows for a cycle. */
export async function calendarForEditing(cycleId: string) {
  const cycle = await prisma.reviewCycle.findUnique({
    where: { id: cycleId },
    select: {
      id: true,
      name: true,
      isActive: true,
      archivedAt: true,
      defaultDueTime: true,
      quietHours: true,
      phases: { orderBy: { phase: "asc" } },
      checkpoints: { orderBy: { dueAt: "asc" } },
      holidays: { orderBy: { date: "asc" } },
      quietPeriods: { orderBy: { fromDate: "asc" } },
      clinics: true,
      extensions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!cycle) return null;
  const daysOff = {
    holidays: cycle.holidays.map((holiday) => keyOf(holiday.date)!),
    breaks: cycle.quietPeriods.map((period) => ({ from: keyOf(period.fromDate)!, to: keyOf(period.toDate)! })),
  };
  const now = new Date();
  const [departments, programmes, approvers] = await Promise.all([
    prisma.department.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.programme.findMany({ select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { id: { in: cycle.extensions.map((extension) => extension.approvedById) } },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  const unitName = (scope: string, id: string) =>
    scope === "DEPARTMENT"
      ? departments.find((item) => item.id === id)?.name
      : scope === "PROGRAMME"
        ? programmes.find((item) => item.id === id)?.name
        : undefined;
  return {
    cycle: { id: cycle.id, name: cycle.name, isActive: cycle.isActive, archived: Boolean(cycle.archivedAt), dueTime: cycle.defaultDueTime },
    quietHours: (cycle.quietHours as Record<string, string> | null) ?? {},
    phases: cycle.phases.map((phase) => ({
      phase: phase.phase,
      name: phase.name,
      desk: phase.desk,
      opensAt: keyOf(phase.opensAt ?? phase.baselineOpensAt),
      dueAt: keyOf(phase.dueAt ?? phase.baselineDueAt),
      anchor: phase.anchor,
    })),
    checkpoints: cycle.checkpoints.map((checkpoint) => ({
      code: checkpoint.code,
      name: checkpoint.name,
      phase: checkpoint.phase,
      type: checkpoint.type,
      dueAt: keyOf(checkpoint.dueAt)!,
    })),
    holidays: cycle.holidays.map((holiday) => ({ id: holiday.id, date: keyOf(holiday.date)!, name: holiday.name })),
    quietPeriods: cycle.quietPeriods.map((period) => ({ id: period.id, from: keyOf(period.fromDate)!, to: keyOf(period.toDate)!, label: period.label })),
    clinics: sortClinics(cycle.clinics.map((clinic) => ({ ...clinic, weekday: clinic.weekday as Weekday, untilDate: keyOf(clinic.untilDate)! }))).map(
      (clinic) => ({
        id: clinic.id,
        title: clinic.title,
        weekday: clinic.weekday,
        startTime: clinic.startTime,
        minutes: clinic.minutes,
        joinUrl: clinic.joinUrl,
        untilDate: clinic.untilDate,
        schedule: describeClinic(clinic),
        next: clinicSessions([clinic], daysOff, now, { limit: 1 })[0] ?? null,
      }),
    ),
    extensions: cycle.extensions.map((extension) => {
      const approver = approvers.find((person) => person.id === extension.approvedById);
      return {
        id: extension.id,
        scope: extension.scope,
        targetId: extension.targetId,
        target: unitName(extension.scope, extension.targetId) ?? extension.targetId,
        phase: extension.phase,
        newDueAt: keyOf(extension.newDueAt)!,
        reason: extension.reason,
        approvedBy: approver ? `${approver.firstName} ${approver.lastName}` : null,
        createdAt: extension.createdAt.toISOString(),
      };
    }),
    departments,
    programmes,
  };
}

/** The people whose deadlines a phase or checkpoint change moves. */
async function peopleForPhase(cycleId: string, phase: number) {
  if (phase === 1) {
    const departments = await prisma.submission.findMany({
      where: { cycleId },
      select: { programme: { select: { departmentId: true } } },
      distinct: ["programmeId"],
    });
    return prisma.user.findMany({
      where: { isActive: true, role: { in: ["HOD", "PROGRAMME_COORDINATOR"] }, departmentId: { in: [...new Set(departments.map((row) => row.programme.departmentId))] } },
      select: { email: true, firstName: true },
    });
  }
  if (phase === 2) return prisma.user.findMany({ where: { isActive: true, role: "DEAN" }, select: { email: true, firstName: true } });
  return prisma.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { email: true, firstName: true } });
}

async function tell(people: { email: string; firstName: string }[], heading: string, intro: string, details: [string, string][]): Promise<number> {
  if (!isEmailConfigured() || people.length === 0) return 0;
  let sent = 0;
  for (const person of people) {
    const content = renderEmail({
      heading,
      intro: `Hello ${person.firstName}, ${intro}`,
      details,
      link: `${getSiteUrl()}/dashboard`,
      linkLabel: "See your deadlines",
    });
    if (await sendEmail({ to: [person.email], subject: heading, ...content }).catch(() => false)) sent += 1;
  }
  return sent;
}

export async function changePhaseDates(
  cycleId: string,
  phase: number,
  input: { opensAt?: unknown; dueAt?: unknown; reason?: unknown; notify?: unknown },
  actorId: string,
) {
  const reason = needReason(input.reason);
  const row = await prisma.cyclePhase.findUnique({ where: { cycleId_phase: { cycleId, phase } } });
  if (!row) throw new CalendarEditError("That phase isn't in this cycle's calendar.", 404);
  const opensAt = input.opensAt === null || input.opensAt === "" ? null : needDate(input.opensAt, "the opening date");
  const dueAt = needDate(input.dueAt, "the due date");
  if (opensAt && opensAt > dueAt) throw new CalendarEditError("The phase must open on or before its due date.");
  const before = { opensAt: keyOf(row.opensAt ?? row.baselineOpensAt), dueAt: keyOf(row.dueAt ?? row.baselineDueAt) };
  await prisma.$transaction(async (tx) => {
    await tx.cyclePhase.update({ where: { id: row.id }, data: { opensAt: opensAt ? dateOnly(opensAt) : null, dueAt: dateOnly(dueAt) } });
    await recordActivity(
      {
        actorId,
        action: "CALENDAR_PHASE_CHANGED",
        entityType: "REVIEW_CYCLE",
        entityId: cycleId,
        description: `Changed Phase ${phase} (${row.name}): due ${before.dueAt ? formatLongDate(before.dueAt) : "no date"} to ${formatLongDate(dueAt)}${opensAt !== before.opensAt ? `, opens ${opensAt ? formatLongDate(opensAt) : "with no date"}` : ""}. Reason: ${reason}`,
        metadata: { phase, before, after: { opensAt, dueAt }, reason },
      },
      tx,
    );
  });
  const told =
    input.notify === false
      ? 0
      : await tell(await peopleForPhase(cycleId, phase), `New date for ${row.name}`, `the deadline for ${row.name} has changed.`, [
          ["Now due", formatLongDate(dueAt)],
          ...(before.dueAt && before.dueAt !== dueAt ? ([["Was", formatLongDate(before.dueAt)]] as [string, string][]) : []),
          ["Why", reason],
        ]);
  return { told };
}

export async function changeCheckpoint(
  cycleId: string,
  code: string,
  input: { dueAt?: unknown; reason?: unknown; notify?: unknown },
  actorId: string,
) {
  const reason = needReason(input.reason);
  const row = await prisma.cycleCheckpoint.findUnique({ where: { cycleId_code: { cycleId, code } } });
  if (!row) throw new CalendarEditError("That checkpoint isn't in this cycle's calendar.", 404);
  const dueAt = needDate(input.dueAt, "the date");
  const before = keyOf(row.dueAt)!;
  await prisma.$transaction(async (tx) => {
    await tx.cycleCheckpoint.update({ where: { id: row.id }, data: { dueAt: dateOnly(dueAt) } });
    // F0: "Submit to School" opens on the Submissions open date.
    if (code === SUBMISSIONS_OPEN_CHECKPOINT) {
      await tx.reviewCycle.update({ where: { id: cycleId }, data: { submissionsOpenAt: startOfDateInstant(dueAt) } });
    }
    await recordActivity(
      {
        actorId,
        action: "CALENDAR_CHECKPOINT_CHANGED",
        entityType: "REVIEW_CYCLE",
        entityId: cycleId,
        description: `Moved ${row.code} (${row.name}) from ${formatLongDate(before)} to ${formatLongDate(dueAt)}. Reason: ${reason}`,
        metadata: { code, before, after: dueAt, reason },
      },
      tx,
    );
  });
  const told =
    input.notify === false
      ? 0
      : await tell(await peopleForPhase(cycleId, row.phase), `New date for ${row.code}: ${row.name}`, `the date for ${row.code} (${row.name}) has changed.`, [
          ["Now", formatLongDate(dueAt)],
          ["Was", formatLongDate(before)],
          ["Why", reason],
        ]);
  return { told };
}

export async function addHoliday(cycleId: string, input: { date?: unknown; name?: unknown }, actorId: string) {
  const date = needDate(input.date, "the holiday's date");
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 100) : "";
  if (!name) throw new CalendarEditError("Name the holiday.");
  const exists = await prisma.cycleHoliday.findUnique({ where: { cycleId_date: { cycleId, date: dateOnly(date) } } });
  if (exists) throw new CalendarEditError(`${formatLongDate(date)} is already a holiday (${exists.name}).`, 409);
  await prisma.$transaction(async (tx) => {
    await tx.cycleHoliday.create({ data: { cycleId, date: dateOnly(date), name } });
    await recordActivity(
      { actorId, action: "CALENDAR_HOLIDAY_ADDED", entityType: "REVIEW_CYCLE", entityId: cycleId, description: `Added a holiday: ${name}, ${formatLongDate(date)}. Countdowns skip it as a working day.` },
      tx,
    );
  });
}

export async function addQuietPeriod(cycleId: string, input: { from?: unknown; to?: unknown; label?: unknown }, actorId: string) {
  const from = needDate(input.from, "the first day");
  const to = needDate(input.to, "the last day");
  if (from > to) throw new CalendarEditError("The quiet period must end on or after its first day.");
  const label = typeof input.label === "string" ? input.label.trim().slice(0, 100) : "";
  if (!label) throw new CalendarEditError("Name the quiet period.");
  await prisma.$transaction(async (tx) => {
    await tx.cycleQuietPeriod.create({ data: { cycleId, fromDate: dateOnly(from), toDate: dateOnly(to), label } });
    await recordActivity(
      { actorId, action: "CALENDAR_QUIET_PERIOD_ADDED", entityType: "REVIEW_CYCLE", entityId: cycleId, description: `Added a quiet period: ${label}, ${formatLongDate(from)} to ${formatLongDate(to)}. No working days and no reminders in it.` },
      tx,
    );
  });
}

/** Task H8: a weekly clinic for Heads of Department, with its joining link. */
export async function addClinic(cycleId: string, input: Record<string, unknown>, actorId: string) {
  const read = readClinicInput(input, dateKeyAt(new Date()));
  if ("error" in read) throw new CalendarEditError(read.error);
  const clinic = read.value;
  await prisma.$transaction(async (tx) => {
    await tx.cycleClinic.create({ data: { cycleId, ...clinic, untilDate: dateOnly(clinic.untilDate) } });
    // The joining link stays out of the log: it can carry the meeting's passcode.
    await recordActivity(
      {
        actorId,
        action: "CALENDAR_CLINIC_ADDED",
        entityType: "REVIEW_CYCLE",
        entityId: cycleId,
        description: `Added a clinic: ${clinic.title}, ${describeClinic(clinic).replace(/^Every/, "every")}, until ${formatLongDate(clinic.untilDate)}. Heads of Department see it on their home page.`,
      },
      tx,
    );
  });
}

const TIME_RANGE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

export async function setQuietHours(cycleId: string, input: { weekdays?: unknown; sabbath?: unknown }, actorId: string) {
  const weekdays = typeof input.weekdays === "string" ? input.weekdays.replace(/\s+/g, "") : "";
  if (!TIME_RANGE.test(weekdays)) throw new CalendarEditError("Give the quiet hours as two times, for example 18:00-08:00.");
  const sabbath = typeof input.sabbath === "string" ? input.sabbath.trim().slice(0, 100) : "";
  const cycle = await prisma.reviewCycle.findUniqueOrThrow({ where: { id: cycleId }, select: { quietHours: true } });
  const quietHours = { ...((cycle.quietHours as Record<string, string> | null) ?? {}), weekdays, ...(sabbath && { sabbath }) };
  await prisma.$transaction(async (tx) => {
    await tx.reviewCycle.update({ where: { id: cycleId }, data: { quietHours } });
    await recordActivity(
      { actorId, action: "CALENDAR_QUIET_HOURS_CHANGED", entityType: "REVIEW_CYCLE", entityId: cycleId, description: `Set the quiet hours to ${weekdays}${sabbath ? ` and ${sabbath}` : ""}.`, metadata: { quietHours } },
      tx,
    );
  });
}

export async function grantExtension(
  cycleId: string,
  input: { scope?: unknown; targetId?: unknown; phase?: unknown; newDueAt?: unknown; reason?: unknown },
  actorId: string,
) {
  const reason = needReason(input.reason);
  const scope = input.scope === "PROGRAMME" ? "PROGRAMME" : input.scope === "DEPARTMENT" ? "DEPARTMENT" : null;
  if (!scope) throw new CalendarEditError("Choose a department or a programme.");
  const targetId = typeof input.targetId === "string" ? input.targetId : "";
  const phase = Number(input.phase);
  const newDueAt = needDate(input.newDueAt, "the new due date");
  const row = await prisma.cyclePhase.findUnique({ where: { cycleId_phase: { cycleId, phase } } });
  if (!row) throw new CalendarEditError("Choose a phase of this cycle.");
  const due = keyOf(row.dueAt ?? row.baselineDueAt);
  if (due && newDueAt <= due) throw new CalendarEditError(`An extension moves the date later than ${formatLongDate(due)}.`);
  const target: { id: string; name: string; departmentId: string } | null =
    scope === "DEPARTMENT"
      ? await prisma.department
          .findUnique({ where: { id: targetId }, select: { id: true, name: true } })
          .then((row) => row && { ...row, departmentId: row.id })
      : await prisma.programme.findUnique({ where: { id: targetId }, select: { id: true, name: true, departmentId: true } });
  if (!target) throw new CalendarEditError("That department or programme doesn't exist.", 404);
  await prisma.$transaction(async (tx) => {
    await tx.cycleExtension.create({ data: { cycleId, scope, targetId, phase, newDueAt: dateOnly(newDueAt), reason, approvedById: actorId } });
    await recordActivity(
      {
        actorId,
        action: "CALENDAR_EXTENSION_GRANTED",
        entityType: "REVIEW_CYCLE",
        entityId: cycleId,
        description: `Extended ${row.name} for ${target.name} to ${formatLongDate(newDueAt)}. Reason: ${reason}`,
        metadata: { scope, targetId, phase, newDueAt, reason },
      },
      tx,
    );
  });
  const departmentId = target.departmentId;
  const people = await prisma.user.findMany({
    where: { isActive: true, departmentId, role: { in: ["HOD", "PROGRAMME_COORDINATOR"] } },
    select: { email: true, firstName: true },
  });
  const told = await tell(people, `Extension: ${row.name} for ${target.name}`, `DAP has extended the deadline for ${target.name}.`, [
    ["Phase", row.name],
    ["New due date", formatLongDate(newDueAt)],
    ["Why", reason],
  ]);
  return { told };
}

/** Removes a holiday, quiet period, clinic or extension (the route checks the typed DELETE). */
export async function removeCalendarItem(cycleId: string, kind: unknown, id: unknown, actorId: string) {
  const itemId = typeof id === "string" ? id : "";
  if (kind === "holiday") {
    const item = await prisma.cycleHoliday.findFirst({ where: { id: itemId, cycleId } });
    if (!item) throw new CalendarEditError("That holiday is no longer in the calendar.", 404);
    await prisma.$transaction(async (tx) => {
      await tx.cycleHoliday.delete({ where: { id: item.id } });
      await recordActivity({ actorId, action: "CALENDAR_HOLIDAY_REMOVED", entityType: "REVIEW_CYCLE", entityId: cycleId, description: `Removed the holiday ${item.name}, ${formatLongDate(keyOf(item.date)!)}.` }, tx);
    });
    return;
  }
  if (kind === "quiet") {
    const item = await prisma.cycleQuietPeriod.findFirst({ where: { id: itemId, cycleId } });
    if (!item) throw new CalendarEditError("That quiet period is no longer in the calendar.", 404);
    await prisma.$transaction(async (tx) => {
      await tx.cycleQuietPeriod.delete({ where: { id: item.id } });
      await recordActivity({ actorId, action: "CALENDAR_QUIET_PERIOD_REMOVED", entityType: "REVIEW_CYCLE", entityId: cycleId, description: `Removed the quiet period ${item.label}.` }, tx);
    });
    return;
  }
  if (kind === "clinic") {
    const item = await prisma.cycleClinic.findFirst({ where: { id: itemId, cycleId } });
    if (!item) throw new CalendarEditError("That clinic is no longer in the calendar.", 404);
    await prisma.$transaction(async (tx) => {
      await tx.cycleClinic.delete({ where: { id: item.id } });
      await recordActivity({ actorId, action: "CALENDAR_CLINIC_REMOVED", entityType: "REVIEW_CYCLE", entityId: cycleId, description: `Removed the clinic ${item.title} (${describeClinic({ ...item, weekday: item.weekday as Weekday })}). It no longer shows on the home page.` }, tx);
    });
    return;
  }
  if (kind === "extension") {
    const item = await prisma.cycleExtension.findFirst({ where: { id: itemId, cycleId } });
    if (!item) throw new CalendarEditError("That extension is no longer in the calendar.", 404);
    await prisma.$transaction(async (tx) => {
      await tx.cycleExtension.delete({ where: { id: item.id } });
      await recordActivity({ actorId, action: "CALENDAR_EXTENSION_REMOVED", entityType: "REVIEW_CYCLE", entityId: cycleId, description: `Removed an extension to ${formatLongDate(keyOf(item.newDueAt)!)}. Its desk is back on the phase's own date.`, metadata: { scope: item.scope, targetId: item.targetId } }, tx);
    });
    return;
  }
  throw new CalendarEditError("Choose a holiday, quiet period, clinic or extension to remove.");
}
