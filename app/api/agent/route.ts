import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { calendarNow } from "@/lib/clock";
import { isDateKey, dateKeyAt } from "@/lib/calendar/dates";
import { isNotSwitchedOn } from "@/lib/courses/course-list";
import { agentControls, planDay, prepareDay } from "@/lib/agent/run";
import { writeMessage } from "@/lib/agent/write";
import { AGENT_SETTINGS } from "@/lib/agent/rules";

const NOT_ON = { error: "The reminder agent isn't switched on yet on this site (its database update hasn't run).", code: "NOT_SWITCHED_ON" };
const dateOnly = (key: string) => new Date(`${key}T00:00:00.000Z`);

/**
 * GET /api/agent?date=YYYY-MM-DD: DAP's view of the reminder agent (T5): the
 * dry run for that date (who hears from it and why, with the message), the
 * messages prepared for it, the controls, and the last 100 messages sent.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const asked = new URL(request.url).searchParams.get("date");
    const date = isDateKey(asked) ? asked : dateKeyAt(await calendarNow());
    const [plan, controls, prepared, history] = await Promise.all([
      planDay(date),
      agentControls(),
      prisma.agentMessage.findMany({
        where: { forDate: dateOnly(date) },
        orderBy: { preparedAt: "asc" },
        include: { recipient: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.agentMessage.findMany({
        where: { status: { in: ["SENT", "FAILED"] } },
        orderBy: { preparedAt: "desc" },
        take: 100,
        include: { recipient: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    return NextResponse.json({
      date,
      settings: { prepareAt: AGENT_SETTINGS.prepareAt, sendAt: AGENT_SETTINGS.sendAt, quiet: AGENT_SETTINGS.quiet },
      controls: { sending: controls.sending, pausedAll: controls.pausedAll, pausedDesks: [...controls.pausedDesks] },
      plan: plan.map((item) => ({
        deskKey: item.facts.deskKey,
        recipient: item.facts.recipient.name,
        email: item.facts.recipient.email,
        department: item.facts.department,
        status: item.facts.status,
        write: item.decision.write,
        reasons: item.decision.reasons,
        mentions: item.decision.mentions,
        quietBecause: item.decision.quietBecause,
        cc: item.cc.map((person) => person.name),
        paused: item.paused,
        preview: item.preview,
      })),
      prepared: prepared.map((message) => ({
        id: message.id,
        deskKey: message.deskKey,
        recipient: `${message.recipient.firstName} ${message.recipient.lastName}`,
        status: message.status,
        subject: message.subject,
        body: message.body,
        reasons: message.reasons,
        writtenBy: message.writtenBy,
        preparedAt: message.preparedAt.toISOString(),
        sentAt: message.sentAt?.toISOString() ?? null,
      })),
      history: history.map((message) => ({
        id: message.id,
        recipient: `${message.recipient.firstName} ${message.recipient.lastName}`,
        forDate: message.forDate.toISOString().slice(0, 10),
        status: message.status,
        subject: message.subject,
        body: message.body,
        reasons: message.reasons,
        writtenBy: message.writtenBy,
        sentAt: message.sentAt?.toISOString() ?? null,
        error: message.error,
      })),
    });
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json(NOT_ON, { status: 503 });
    console.error("Failed to load the reminder agent:", error);
    return NextResponse.json({ error: "Failed to load the reminder agent" }, { status: 500 });
  }
}

/**
 * POST /api/agent: DAP's controls (T5). { action: "sending", value: "on" |
 * "off" } (Super Administrators only); "pause" or "resume" with { deskKey } or
 * none for everyone; "hold", "release" or "edit" ({ subject, body }) a
 * prepared message; "prepare" a date now; "samples": up to 20 messages for a
 * date written by the AI, not stored, for DAP to read.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return auth.response;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const actor = auth.user.id;
    const log = (action: string, description: string, metadata?: object) =>
      recordActivity({ actorId: actor, action, entityType: "AGENT", description, metadata });

    switch (body.action) {
      case "sending": {
        if (auth.user.role !== "SUPER_ADMIN") {
          return NextResponse.json({ error: "Only a Super Administrator switches sending on or off." }, { status: 403 });
        }
        const on = body.value === "on";
        await prisma.agentControl.upsert({
          where: { key: "sending" },
          create: { key: "sending", value: on ? "on" : "off", updatedById: actor },
          update: { value: on ? "on" : "off", updatedById: actor },
        });
        await log("AGENT_SENDING_CHANGED", `Switched the reminder agent's sending ${on ? "on" : "off"}.`);
        break;
      }
      case "pause":
      case "resume": {
        const deskKey = typeof body.deskKey === "string" && body.deskKey.startsWith("HOD:") ? body.deskKey : null;
        const key = deskKey ? `pause:${deskKey}` : "pause:ALL";
        const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) || null : null;
        await prisma.agentControl.upsert({
          where: { key },
          create: { key, value: body.action === "pause" ? "on" : "off", reason, updatedById: actor },
          update: { value: body.action === "pause" ? "on" : "off", reason, updatedById: actor },
        });
        await log(
          body.action === "pause" ? "AGENT_PAUSED" : "AGENT_RESUMED",
          `${body.action === "pause" ? "Paused" : "Resumed"} the reminder agent ${deskKey ? "for one desk" : "for everyone"}.${reason ? ` Reason: ${reason}` : ""}`,
          { deskKey },
        );
        break;
      }
      case "hold":
      case "release":
      case "edit": {
        const id = typeof body.messageId === "string" ? body.messageId : "";
        const message = await prisma.agentMessage.findUnique({ where: { id } });
        if (!message) return NextResponse.json({ error: "That message no longer exists." }, { status: 404 });
        if (message.status === "SENT") return NextResponse.json({ error: "That message has already been sent." }, { status: 409 });
        if (body.action === "edit") {
          const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 200) : "";
          const text = typeof body.body === "string" ? body.body.trim().slice(0, 5000) : "";
          if (!subject || text.length < 20) return NextResponse.json({ error: "Give the message a subject and some text." }, { status: 400 });
          await prisma.agentMessage.update({ where: { id }, data: { subject, body: text, editedById: actor } });
          await log("AGENT_MESSAGE_EDITED", `Edited the reminder "${subject}" before it was sent.`, { messageId: id });
        } else {
          await prisma.agentMessage.update({ where: { id }, data: { status: body.action === "hold" ? "HELD" : "PREPARED" } });
          await log(body.action === "hold" ? "AGENT_MESSAGE_HELD" : "AGENT_MESSAGE_RELEASED", `${body.action === "hold" ? "Held" : "Released"} the reminder "${message.subject}".`, { messageId: id });
        }
        break;
      }
      case "prepare": {
        const date = isDateKey(body.date) ? body.date : dateKeyAt(await calendarNow());
        const result = await prepareDay(date);
        return NextResponse.json({ ...result });
      }
      case "samples": {
        const date = isDateKey(body.date) ? body.date : dateKeyAt(await calendarNow());
        const plan = await planDay(date);
        const chosen = plan.slice(0, AGENT_SETTINGS.limits.samplesPerRun);
        const samples = [];
        for (const item of chosen) {
          const decision = item.decision.write ? item.decision : { reasons: ["Monday summary"], mentions: [] };
          const written = await writeMessage(item.facts, decision);
          samples.push({ recipient: item.facts.recipient.name, department: item.facts.department, reasons: decision.reasons, ...written });
        }
        return NextResponse.json({ samples });
      }
      default:
        return NextResponse.json({ error: "Choose what to do." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isNotSwitchedOn(error)) return NextResponse.json(NOT_ON, { status: 503 });
    console.error("Failed to change the reminder agent:", error);
    return NextResponse.json({ error: "Failed to change the reminder agent" }, { status: 500 });
  }
}
