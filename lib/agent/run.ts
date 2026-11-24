/**
 * Tasks T3 to T6: the reminder agent's day, for the Heads of Department's
 * desks (Departmental Drafting).
 *
 * - planDay: the dry run for any date. Who would hear from the agent, why,
 *   who is copied, and the plain message. Writes nothing.
 * - prepareDay: from 7:00 am WAT, writes the day's messages (AI or
 *   template), held for an hour so DAP can read, edit or hold them.
 * - sendDue: from 8:00 am WAT, sends what was prepared at least 55 minutes
 *   earlier, by email, only while DAP has sending switched on, never in quiet
 *   hours, and never to a paused desk. Every message is kept with its facts.
 *
 * The agent only reads the drafts; the only things it writes are its own
 * messages and the activity log (tests/unit/agent-safety.test.ts checks).
 */
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { loadActiveCycleCalendar } from "@/lib/calendar/desk";
import { type DateKey, daysBetween, dateKeyAt, deadlineInstant } from "@/lib/calendar/dates";
import type { DeadlineStatus } from "@/lib/calendar/countdown";
import { headDeskStatus, programmeDeskStatuses } from "@/lib/desk/programme-status";
import { progressForDrafts } from "@/lib/submissions/section-status";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { SHELL_END, SHELL_START, escapeHtml } from "@/lib/email/notifications";
import { getSiteUrl } from "@/lib/site-url";
import { AGENT_SETTINGS, decideForDesk, maySendAt, type DeskDecision } from "@/lib/agent/rules";
import { type DeskFacts, type WrittenMessage, templateMessage, writeMessage } from "@/lib/agent/write";

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const watMinutes = (now: Date) => {
  const wat = new Date(now.getTime() + 60 * 60 * 1000);
  return wat.getUTCHours() * 60 + wat.getUTCMinutes();
};
const dateOnly = (key: DateKey) => new Date(`${key}T00:00:00.000Z`);

export type AgentControls = { sending: boolean; pausedAll: boolean; pausedDesks: Set<string> };

export async function agentControls(): Promise<AgentControls> {
  const rows = await prisma.agentControl.findMany();
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  return {
    sending: value("sending") === "on",
    pausedAll: value("pause:ALL") === "on",
    pausedDesks: new Set(rows.filter((row) => row.key.startsWith("pause:HOD:") && row.value === "on").map((row) => row.key.slice(6))),
  };
}

const formalName = (user: { title: string | null; firstName: string; lastName: string }) =>
  user.title ? `${user.title} ${user.lastName}` : `${user.firstName} ${user.lastName}`;

/** Each Head of Department's desk with its facts, as of `asOf`. */
export async function headDesks(asOf: Date): Promise<DeskFacts[]> {
  const calendar = await loadActiveCycleCalendar();
  const phase = calendar?.phases.find((row) => row.phase === 1);
  if (!calendar || !phase?.dueAt) return [];
  const heads = await prisma.user.findMany({
    where: { role: "HOD", isActive: true, departmentId: { not: null } },
    select: { id: true, email: true, title: true, firstName: true, lastName: true, departmentId: true, department: { select: { name: true, schoolId: true } } },
    orderBy: { lastName: "asc" },
  });
  if (heads.length === 0) return [];
  const drafts = await prisma.submission.findMany({
    where: { cycleId: calendar.cycleId, programme: { departmentId: { in: heads.map((head) => head.departmentId!) } } },
    select: { id: true, currentPhase: true, status: true, updatedAt: true, programme: { select: { id: true, name: true, departmentId: true } } },
    orderBy: { programme: { name: "asc" } },
  });
  const [statuses, progress, deans, leadership] = await Promise.all([
    programmeDeskStatuses(calendar, drafts.filter((draft) => draft.currentPhase === 1), asOf),
    progressForDrafts(drafts.map((draft) => draft.id)),
    prisma.user.findMany({ where: { role: "DEAN", isActive: true }, select: { id: true, email: true, title: true, firstName: true, lastName: true, schoolId: true } }),
    prisma.user.findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true, email: true, title: true, firstName: true, lastName: true } }),
  ]);
  const site = getSiteUrl();
  const today = dateKeyAt(asOf);
  const nextCheckpoint = calendar.checkpoints.find(
    (checkpoint) => checkpoint.phase === 1 && checkpoint.type !== "MILESTONE" && checkpoint.code !== "FINAL" && checkpoint.dueAt >= today,
  );

  return heads.flatMap((head) => {
    const own = drafts.filter((draft) => draft.programme.departmentId === head.departmentId);
    const drafting = own.filter((draft) => statuses.has(draft.id));
    if (drafting.length === 0) return [];
    const deskStatus = headDeskStatus(drafting.map((draft) => ({ programme: draft.programme.name, status: statuses.get(draft.id)! })));
    if (!deskStatus) return [];
    const dean = deans.find((person) => person.schoolId === head.department?.schoolId);
    const extended = calendar.extensions
      .filter((extension) => extension.phase === 1 && extension.scope === "DEPARTMENT" && extension.targetId === head.departmentId)
      .map((extension) => extension.newDueAt)
      .sort()
      .at(-1);
    const finalDate = extended ?? phase.dueAt!;
    return [
      {
        deskKey: `HOD:${head.id}`,
        recipient: { id: head.id, email: head.email, name: formalName(head), firstName: head.firstName },
        department: head.department?.name ?? "Your department",
        status: { status: deskStatus.status, label: deskStatus.label, reason: deskStatus.reason },
        programmes: drafting.map((draft) => {
          const done = progress.get(draft.id);
          const toFinish = (done?.sections ?? []).filter((section) => !section.complete);
          return {
            name: draft.programme.name,
            submissionId: draft.id,
            percentage: done?.percentage ?? 0,
            toFinish: toFinish.map((section) => (section.hint ? `${section.label} (${section.hint})` : section.label)),
            status: statuses.get(draft.id)?.label ?? null,
            link: `${site}/submissions/${draft.id}${toFinish[0] ? `?section=${toFinish[0].key}` : ""}`,
          };
        }),
        nextCheckpoint: nextCheckpoint
          ? { code: nextCheckpoint.code, name: nextCheckpoint.name, date: nextCheckpoint.dueAt, days: daysBetween(today, nextCheckpoint.dueAt) }
          : null,
        finalDate,
        daysToFinal: daysBetween(today, finalDate),
        supervisor: dean ? { id: dean.id, email: dean.email, name: formalName(dean) } : null,
        leadership: leadership.map((person) => ({ id: person.id, email: person.email, name: formalName(person) })),
        homeLink: `${site}/dashboard`,
        askLink: `${site}/dashboard`,
      },
    ];
  });
}

async function historyFor(deskKeys: string[]) {
  const sent = await prisma.agentMessage.findMany({
    where: { deskKey: { in: deskKeys }, status: "SENT" },
    orderBy: { forDate: "desc" },
    select: { deskKey: true, forDate: true, facts: true },
    take: 20 * Math.max(1, deskKeys.length),
  });
  const map = new Map<string, { date: DateKey; status: DeadlineStatus }[]>();
  for (const row of sent) {
    const list = map.get(row.deskKey) ?? [];
    list.push({ date: row.forDate.toISOString().slice(0, 10), status: ((row.facts as { status?: { status?: DeadlineStatus } })?.status?.status ?? "ON_TRACK") });
    map.set(row.deskKey, list);
  }
  return map;
}

export type PlannedDesk = {
  facts: DeskFacts;
  decision: DeskDecision;
  paused: boolean;
  cc: { id: string; email: string; name: string }[];
  preview: WrittenMessage;
};

/** The dry run (T3): who hears from the agent on `date` and why. Writes nothing. */
export async function planDay(date: DateKey): Promise<PlannedDesk[]> {
  const asOf = deadlineInstant(date, AGENT_SETTINGS.prepareAt);
  const calendar = await loadActiveCycleCalendar();
  if (!calendar) return [];
  const desks = await headDesks(asOf);
  const [history, controls] = await Promise.all([historyFor(desks.map((desk) => desk.deskKey)), agentControls()]);
  const checkpoints = calendar.checkpoints
    .filter((checkpoint) => checkpoint.phase === 1 && checkpoint.type !== "MILESTONE")
    .map((checkpoint) => ({ code: checkpoint.code, name: checkpoint.name, dueDate: checkpoint.dueAt }));
  return desks.map((facts) => {
    const decision = decideForDesk({
      date,
      calendar: calendar.calendar,
      status: facts.status.status as DeadlineStatus,
      checkpoints,
      finalDate: facts.finalDate,
      history: (history.get(facts.deskKey) ?? []).filter((item) => item.date < date || item.date === date),
    });
    const cc = [
      ...(decision.copySupervisor && facts.supervisor ? [facts.supervisor] : []),
      ...(decision.copyLeadership ? facts.leadership : []),
    ];
    return {
      facts,
      decision,
      paused: controls.pausedAll || controls.pausedDesks.has(facts.deskKey),
      cc,
      preview: templateMessage(facts, decision),
    };
  });
}

/** Writes the day's messages (from 7:00 am). Paused desks' messages are held. */
export async function prepareDay(date: DateKey, options: { useAi?: boolean } = {}) {
  const planned = (await planDay(date)).filter((item) => item.decision.write);
  const existing = new Set(
    (await prisma.agentMessage.findMany({ where: { forDate: dateOnly(date) }, select: { deskKey: true } })).map((row) => row.deskKey),
  );
  let prepared = 0;
  for (const item of planned) {
    if (existing.has(item.facts.deskKey)) continue;
    const written = await writeMessage(item.facts, item.decision, { useAi: options.useAi });
    await prisma.agentMessage.create({
      data: {
        deskKey: item.facts.deskKey,
        recipientId: item.facts.recipient.id,
        ccIds: item.cc.map((person) => person.id),
        forDate: dateOnly(date),
        status: item.paused ? "HELD" : "PREPARED",
        subject: written.subject,
        body: written.body,
        reasons: [...item.decision.reasons, ...item.decision.mentions],
        facts: JSON.parse(JSON.stringify({ ...item.facts, cc: item.cc })),
        writtenBy: written.writtenBy,
      },
    });
    prepared += 1;
  }
  if (prepared > 0) {
    await recordActivity({
      action: "AGENT_PREPARED",
      entityType: "AGENT",
      description: `The reminder agent prepared ${prepared} message${prepared === 1 ? "" : "s"} for ${date}.`,
      metadata: { date, prepared },
    });
  }
  return { prepared };
}

function emailHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((block) =>
      `<p style="margin:0 0 12px;color:#334155;line-height:1.5">${escapeHtml(block)
        .replace(/\n/g, "<br>")
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#003cbb">$1</a>')}</p>`,
    )
    .join("");
  return `${SHELL_START}${paragraphs}${SHELL_END}`;
}

/** Sends what is due (from 8:00 am), if DAP has sending switched on. */
export async function sendDue(now: Date) {
  const controls = await agentControls();
  if (!controls.sending) return { sent: 0, because: "Sending is switched off." };
  const window = maySendAt(now);
  if (!window.ok) return { sent: 0, because: window.because };
  if (controls.pausedAll) return { sent: 0, because: "The agent is paused for everyone." };
  const today = dateKeyAt(now);
  const due = await prisma.agentMessage.findMany({
    where: { forDate: dateOnly(today), status: "PREPARED", preparedAt: { lte: new Date(now.getTime() - 55 * 60_000) } },
    include: { recipient: { select: { email: true, isActive: true } } },
  });
  let sent = 0;
  for (const message of due) {
    if (controls.pausedDesks.has(message.deskKey) || !message.recipient.isActive) {
      await prisma.agentMessage.update({ where: { id: message.id }, data: { status: "HELD" } });
      continue;
    }
    const cc = message.ccIds.length
      ? (await prisma.user.findMany({ where: { id: { in: message.ccIds }, isActive: true }, select: { email: true } })).map((person) => person.email)
      : [];
    const ok =
      isEmailConfigured() &&
      (await sendEmail({
        to: [message.recipient.email, ...cc],
        subject: message.subject,
        html: emailHtml(message.body),
        text: message.body,
        fromName: "Academic Planning",
      }).catch(() => false));
    await prisma.agentMessage.update({
      where: { id: message.id },
      data: ok ? { status: "SENT", sentAt: now } : { status: "FAILED", error: isEmailConfigured() ? "The email service refused it." : "Email isn't set up on this site." },
    });
    await recordActivity({
      action: ok ? "AGENT_MESSAGE_SENT" : "AGENT_MESSAGE_FAILED",
      entityType: "AGENT",
      entityId: message.id,
      description: `${ok ? "Sent" : "Couldn't send"} the reminder "${message.subject}"${cc.length ? ` (copied to ${cc.length})` : ""}.`,
      metadata: { deskKey: message.deskKey, reasons: message.reasons, facts: message.facts, writtenBy: message.writtenBy },
    });
    if (ok) sent += 1;
  }
  return { sent, because: null };
}

/** The scheduled run: prepare from 7:00, send from 8:00 (West Africa Time). */
export async function runAgent(now: Date) {
  const today = dateKeyAt(now);
  const minutes = watMinutes(now);
  const result: Record<string, unknown> = { date: today };
  if (minutes >= minutesOf(AGENT_SETTINGS.prepareAt)) result.prepare = await prepareDay(today);
  if (minutes >= minutesOf(AGENT_SETTINGS.sendAt)) result.send = await sendDue(now);
  return result;
}

/** The person's own recent messages from the agent, for the home page (in-app channel). */
export async function myAgentMessages(userId: string) {
  return prisma.agentMessage.findMany({
    where: { recipientId: userId, status: "SENT" },
    orderBy: { sentAt: "desc" },
    take: 5,
    select: { id: true, subject: true, body: true, sentAt: true },
  });
}
