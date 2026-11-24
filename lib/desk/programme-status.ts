/**
 * Task T2 for the Heads of Department's desks: the status of each
 * programme's draft in Departmental Drafting (phase 1), from its honest
 * progress (G5), its checkpoints (section 4.2), when anyone last worked on it
 * and when the department's Head or coordinators last signed in.
 */
import prisma from "@/lib/prisma";
import { isGeneralEducationCourse } from "@/lib/courses/general-education";
import { type CycleCalendar, extensionFor } from "@/lib/calendar/desk";
import { dateKeyAt } from "@/lib/calendar/dates";
import type { Countdown } from "@/lib/calendar/countdown";
import { progressForDrafts } from "@/lib/submissions/section-status";
import { checkpointMet, deskStatus, worstStatus, type DeskStatus } from "@/lib/desk/status";

type Draft = {
  id: string;
  currentPhase: number;
  status: string;
  updatedAt: Date;
  programme: { id: string; departmentId: string; name?: string };
};

const STILL_DRAFTING = ["DRAFT", "CORRECTIONS_REQUIRED"];

export async function programmeDeskStatuses(
  calendar: CycleCalendar,
  drafts: Draft[],
  now: Date,
): Promise<Map<string, DeskStatus>> {
  const phase = calendar.phases.find((row) => row.phase === 1);
  if (!phase?.dueAt || !phase.opensAt || drafts.length === 0) return new Map();
  const ids = drafts.map((draft) => draft.id);
  const departmentIds = [...new Set(drafts.map((draft) => draft.programme.departmentId))];

  const [progress, activity, people, rows] = await Promise.all([
    progressForDrafts(ids),
    prisma.activityLog.groupBy({ by: ["entityId"], where: { entityId: { in: ids } }, _max: { createdAt: true } }),
    prisma.user.findMany({
      where: { departmentId: { in: departmentIds }, role: { in: ["HOD", "PROGRAMME_COORDINATOR"] }, isActive: true },
      select: { departmentId: true, lastActiveAt: true, firstSignInAt: true },
    }),
    prisma.course.findMany({
      where: { submissionId: { in: ids } },
      select: { submissionId: true, code: true, masterCourse: { select: { type: true, ownership: true } }, description: { select: { graceStatus: true } } },
    }),
  ]);
  const lastActivity = new Map(activity.map((row) => [row.entityId, row._max.createdAt]));
  const lastSignIn = new Map<string, Date>();
  for (const person of people) {
    const seen = person.lastActiveAt ?? person.firstSignInAt;
    if (!seen || !person.departmentId) continue;
    const held = lastSignIn.get(person.departmentId);
    if (!held || seen > held) lastSignIn.set(person.departmentId, seen);
  }
  const graceNotRun = new Set(
    rows
      .filter((row) => !isGeneralEducationCourse(row) && (!row.description || ["PENDING", "CHECKING"].includes(row.description.graceStatus)))
      .map((row) => row.submissionId),
  );
  const today = dateKeyAt(now);
  const checkpoints = calendar.checkpoints.filter(
    (checkpoint) =>
      checkpoint.phase === 1 &&
      checkpoint.type !== "MILESTONE" &&
      (checkpoint.desks.length === 0 || checkpoint.desks.includes("HOD")),
  );

  const statuses = new Map<string, DeskStatus>();
  for (const draft of drafts) {
    const done = progress.get(draft.id);
    const sections = done?.sections ?? [];
    const finished = draft.currentPhase > 1 || !STILL_DRAFTING.includes(draft.status);
    const facts = {
      sectionComplete: (number: number) => Boolean(sections[number - 1]?.complete),
      descriptionsShare: (sections.find((section) => section.key === "descriptions")?.percentage ?? 0) / 100,
      courseListConfirmed: Boolean(sections.find((section) => section.key === "courses")?.complete),
      submitted: finished,
      graceRunOnAll: !graceNotRun.has(draft.id),
    };
    // Checkpoints whose day has ended (the due date itself still counts).
    const missed = checkpoints.find((checkpoint) => checkpoint.dueAt < today && !checkpointMet(checkpoint, facts));
    const extendedTo = extensionFor(calendar, 1, { departmentIds: [draft.programme.departmentId], programmeIds: [draft.programme.id] });
    const lastWorked = [lastActivity.get(draft.id), draft.updatedAt].filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    statuses.set(
      draft.id,
      deskStatus({
        now,
        calendar: calendar.calendar,
        openedOn: phase.opensAt,
        dueDate: extendedTo ?? phase.dueAt,
        dueTime: calendar.dueTime,
        doneShare: (done?.percentage ?? 0) / 100,
        finished,
        lastActivityAt: lastWorked,
        lastSignInAt: lastSignIn.get(draft.programme.departmentId) ?? null,
        missedCheckpoint: missed ? { code: missed.code, dueDate: missed.dueAt } : null,
      }),
    );
  }
  return statuses;
}

/** The countdown with the desk's T2 status and its reason in place of the simple rule. */
export function withDeskStatus(countdown: Countdown | null, status: DeskStatus | null | undefined): Countdown | null {
  if (!countdown || !status) return countdown;
  return { ...countdown, status: status.status, statusLabel: status.label, statusReason: status.reason };
}

/** A Head's own desk: the worst of their programmes, naming it when there are several. */
export function headDeskStatus(
  statuses: { programme: string; status: DeskStatus }[],
): DeskStatus | null {
  const worst = worstStatus(statuses.map((item) => ({ ...item.status, programme: item.programme })));
  if (!worst) return null;
  const { programme, ...status } = worst;
  return statuses.length > 1 ? { ...status, reason: `${status.reason.replace(/^([^:]+): /, `$1: ${programme}: `)}` } : status;
}
