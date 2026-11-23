/**
 * Invitations (work order task D3, Appendix C): one email to each Head of
 * Department, programme coordinator and Dean, at 8:00 am WAT on Thursday,
 * November 26, 2026, with a link straight to their home page, their
 * deadline, the launch session and who to contact for help. Admins can send
 * one again at any time. The app records when each person was invited,
 * first signed in and was last active.
 */
import type { UserRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { INVITATIONS } from "@/lib/site-config";
import { getSiteUrl } from "@/lib/site-url";
import { type EmailMessage, isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { SHELL_END, SHELL_START, button, escapeHtml } from "@/lib/email/notifications";
import type { Countdown } from "@/lib/calendar/countdown";
import { deskCountdown, loadActiveCycleCalendar } from "@/lib/calendar/desk";
import { UNIVERSITY_DOMAIN, isUniversityEmail } from "@/lib/sign-in-access";

const ROLE_NAMES: Record<string, string> = {
  HOD: "Head of Department",
  PROGRAMME_COORDINATOR: "Programme Coordinator",
  DEAN: "Dean",
};

export type InvitationPerson = {
  email: string;
  title: string | null;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActing: boolean;
  unit: string;
};

export type HelpContact = { name: string; email: string; whatsapp: string | null };

export type InvitationContext = {
  siteUrl: string;
  deadline: Countdown | null;
  launchSession?: string | null;
  helpContact?: HelpContact | null;
  generalHelp?: string | null;
  replyTo?: string | null;
};

/** The email itself; no database access, so it can be checked in tests. */
export function invitationEmail(person: InvitationPerson, context: InvitationContext): EmailMessage {
  const greeting = person.title ? `${person.title} ${person.lastName}` : `${person.firstName} ${person.lastName}`;
  const role = `${person.isActing ? "Acting " : ""}${ROLE_NAMES[person.role] ?? person.role}`;
  const link = `${context.siteUrl}/dashboard`;
  const deadline = context.deadline
    ? `${context.deadline.label}: ${context.deadline.dueLine.replace(/^Due /, "due ")} (${context.deadline.headline.toLowerCase()})`
    : null;
  const help = context.helpContact
    ? `${context.helpContact.name}, ${context.helpContact.email}${context.helpContact.whatsapp ? `, WhatsApp ${context.helpContact.whatsapp}` : ""}`
    : (context.generalHelp ?? null);

  const intro =
    `Dear ${greeting}, the Directorate of Academic Planning has set up your desk on the Academic Bulletin Review System for the 2027-2031 Bulletin, as ${role}, ${person.unit}.` +
    (deadline ? ` ${deadline}.` : "");
  const details: [string, string][] = [
    ["Your role", `${role}, ${person.unit}`],
    ...(deadline ? ([["Your deadline", deadline]] as [string, string][]) : []),
    ...(context.launchSession ? ([["Launch session", context.launchSession]] as [string, string][]) : []),
    ...(help ? ([["Help", help]] as [string, string][]) : []),
  ];
  const steps = [
    `Open your desk with the button below and choose "Sign in with Google". Use the Google account for ${person.email}; there is no password to set.`,
    'Set up the authenticator app when asked: scan the code with Google Authenticator or Microsoft Authenticator, type the six-digit code, and tick "Remember this device for 30 days".',
    "You arrive on your home page, with your programmes and your deadline at the top.",
  ];

  const rows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const html = `${SHELL_START}
<h1 style="margin:0 0 12px;font-size:18px;color:#003cbb">Your Academic Bulletin desk is ready</h1>
<p style="margin:0 0 16px;color:#334155;line-height:1.5">${escapeHtml(intro)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows}</table>
<p style="margin:16px 0 6px;color:#0f172a;font-weight:600">Getting in takes about five minutes</p>
<ol style="margin:0;padding-left:20px;color:#334155;line-height:1.5">${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
${button(link, "Open your desk")}
${SHELL_END}`;
  const text = [
    "Your Academic Bulletin desk is ready",
    "",
    intro,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    "Getting in takes about five minutes:",
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    `Open your desk: ${link}`,
  ].join("\n");

  return {
    to: [person.email],
    subject: "Your Academic Bulletin desk is ready",
    html,
    text,
    fromName: INVITATIONS.fromName,
    ...(context.replyTo && { replyTo: [context.replyTo] }),
  };
}

/** The person's unit in words, and the DAP officer for their school. */
async function loadPerson(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      title: true,
      firstName: true,
      lastName: true,
      role: true,
      isActing: true,
      isActive: true,
      schoolId: true,
      departmentId: true,
      school: { select: { name: true } },
      department: { select: { name: true } },
      programmeAssignments: { select: { programmeId: true, programme: { select: { name: true } } } },
    },
  });
  if (!user) return null;
  const unit =
    user.role === "DEAN"
      ? (user.school?.name ?? "your school")
      : user.role === "PROGRAMME_COORDINATOR" && user.programmeAssignments.length
        ? user.programmeAssignments.map((item) => item.programme.name).join(", ")
        : (user.department?.name ?? "your department");
  // The DAP officer named for the school on the roster (task D1).
  const officer = user.schoolId
    ? await prisma.user.findFirst({
        where: { role: "ADMIN", isActive: true, schoolId: user.schoolId },
        select: { title: true, firstName: true, lastName: true, email: true, whatsapp: true },
        orderBy: { createdAt: "asc" },
      })
    : null;
  return { user, unit, officer };
}

export type InvitationResult = { userId: string; email: string; sent: boolean; reason?: string };

/** Sends (or sends again) one person's invitation, and records when. */
export async function sendInvitation(userId: string, now: Date = new Date()): Promise<InvitationResult> {
  const loaded = await loadPerson(userId);
  if (!loaded) return { userId, email: "", sent: false, reason: "No such person." };
  const { user, unit, officer } = loaded;
  if (!user.isActive) return { userId, email: user.email, sent: false, reason: "The account is deactivated." };
  if (!(INVITATIONS.roles as readonly string[]).includes(user.role)) {
    return { userId, email: user.email, sent: false, reason: "Invitations are for Heads, coordinators and Deans." };
  }
  // Only university accounts: test accounts on personal addresses never get one.
  if (!isUniversityEmail(user.email)) {
    return { userId, email: user.email, sent: false, reason: "Invitations go only to babcock.edu.ng addresses." };
  }
  if (!isEmailConfigured()) return { userId, email: user.email, sent: false, reason: "Email isn't set up on this site." };

  const calendar = await loadActiveCycleCalendar();
  const message = invitationEmail(
    { email: user.email, title: user.title, firstName: user.firstName, lastName: user.lastName, role: user.role, isActing: user.isActing, unit },
    {
      siteUrl: getSiteUrl(),
      deadline: calendar
        ? deskCountdown(
            calendar,
            {
              id: user.id,
              role: user.role,
              departmentId: user.departmentId,
              schoolId: user.schoolId,
              programmeIds: user.programmeAssignments.map((item) => item.programmeId),
            },
            now,
          )
        : null,
      launchSession: process.env.INVITATION_LAUNCH_SESSION?.trim() || null,
      helpContact: officer
        ? {
            name: [officer.title, officer.firstName, officer.lastName].filter(Boolean).join(" "),
            email: officer.email,
            whatsapp: officer.whatsapp,
          }
        : null,
      generalHelp: process.env.INVITATION_HELP_CONTACT?.trim() || null,
      replyTo: process.env.INVITATION_REPLY_TO?.trim() || null,
    },
  );
  const sent = await sendEmail(message);
  if (!sent) return { userId, email: user.email, sent: false, reason: "The email service didn't accept it." };
  await prisma.user.update({ where: { id: user.id }, data: { invitedAt: now } });
  return { userId, email: user.email, sent: true };
}

/** Everyone still waiting for their first invitation. */
export function uninvitedPeople() {
  return prisma.user.findMany({
    where: {
      isActive: true,
      invitedAt: null,
      role: { in: [...INVITATIONS.roles] },
      email: { endsWith: `@${UNIVERSITY_DOMAIN}`, mode: "insensitive" },
    },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
    orderBy: [{ role: "asc" }, { lastName: "asc" }],
  });
}

/**
 * Sends every waiting invitation, but not before the launch time. The daily
 * job calls this; so can an admin. Returns what happened to each person.
 */
export async function sendDueInvitations(now: Date = new Date(), options: { evenBeforeLaunch?: boolean } = {}) {
  if (!options.evenBeforeLaunch && now < new Date(INVITATIONS.sendAt)) {
    return { due: false, results: [] as InvitationResult[] };
  }
  const results: InvitationResult[] = [];
  for (const person of await uninvitedPeople()) results.push(await sendInvitation(person.id, now));
  return { due: true, results };
}
