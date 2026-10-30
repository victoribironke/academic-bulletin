/**
 * Notification emails.
 *
 * Workflow updates go out once a day as a summary (see sendDailyDigests),
 * not one email per action. That keeps the volume to at most one email per
 * person per day, well inside the Resend free plan (100 a day, 3,000 a month):
 *  - Admins / Super Admins: bulletins submitted for review since the last summary.
 *  - HODs: review decisions on their department's bulletins, with remarks.
 *
 * New users get one "you've been added" email when an admin creates them.
 */
import prisma from "@/lib/prisma";
import { getSiteUrl } from "@/lib/supabase/config";
import { PHASE_NAMES } from "@/lib/submissions/phases";
import { isEmailConfigured, sendEmail } from "./resend";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SHELL_START = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
<div style="background:#003cbb;color:#ffffff;padding:16px 24px;font-size:16px;font-weight:700">Academic Bulletin</div>
<div style="padding:24px">`;
const SHELL_END = `</div></div></body></html>`;

function button(link: string, label: string): string {
  return `<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#003cbb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">${escapeHtml(label)}</a></p>`;
}

function renderEmail(opts: {
  heading: string;
  intro: string;
  details: Array<[string, string]>;
  link: string;
  linkLabel: string;
}): { html: string; text: string } {
  const rows = opts.details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${escapeHtml(label)}</td>` +
        `<td style="padding:4px 0;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `${SHELL_START}
<h1 style="margin:0 0 12px;font-size:18px;color:#003cbb">${escapeHtml(opts.heading)}</h1>
<p style="margin:0 0 16px;color:#334155;line-height:1.5">${escapeHtml(opts.intro)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows}</table>
${button(opts.link, opts.linkLabel)}
${SHELL_END}`;

  const text = [
    opts.heading,
    "",
    opts.intro,
    "",
    ...opts.details.map(([label, value]) => `${label}: ${value}`),
    "",
    `${opts.linkLabel}: ${opts.link}`,
  ].join("\n");

  return { html, text };
}

type DigestItem = {
  title: string;
  /** True when the recipient has something to do (e.g. make corrections). */
  needsAction?: boolean;
  lines: string[];
  remarks?: string | null;
  link: string;
};

function renderDigest(opts: {
  heading: string;
  intro: string;
  items: DigestItem[];
  footer?: string;
  link: string;
  linkLabel: string;
}): { html: string; text: string } {
  const itemsHtml = opts.items
    .map((item) => {
      const remarks = item.remarks?.trim()
        ? `<div style="margin:8px 0 0;padding:10px 12px;background:#f5f5f5;border-radius:6px;color:#0f172a;white-space:pre-wrap">${escapeHtml(item.remarks.trim())}</div>`
        : "";
      return `<div style="padding:14px 0;border-top:1px solid #e2e8f0">
<a href="${escapeHtml(item.link)}" style="font-weight:700;color:#003cbb;text-decoration:none">${escapeHtml(item.title)}</a>
${item.lines.map((l) => `<div style="color:#475569;font-size:14px;margin-top:2px">${escapeHtml(l)}</div>`).join("")}
${remarks}
</div>`;
    })
    .join("");

  const html = `${SHELL_START}
<h1 style="margin:0 0 12px;font-size:18px;color:#003cbb">${escapeHtml(opts.heading)}</h1>
<p style="margin:0 0 8px;color:#334155;line-height:1.5">${escapeHtml(opts.intro)}</p>
${itemsHtml}
${opts.footer ? `<p style="margin:16px 0 0;color:#334155">${escapeHtml(opts.footer)}</p>` : ""}
${button(opts.link, opts.linkLabel)}
${SHELL_END}`;

  const text = [
    opts.heading,
    "",
    opts.intro,
    "",
    ...opts.items.flatMap((item) => [
      `- ${item.title}`,
      ...item.lines.map((l) => `  ${l}`),
      ...(item.remarks?.trim() ? [`  Remarks: ${item.remarks.trim()}`] : []),
      `  ${item.link}`,
      "",
    ]),
    ...(opts.footer ? [opts.footer, ""] : []),
    `${opts.linkLabel}: ${opts.link}`,
  ].join("\n");

  return { html, text };
}

// ── Daily summaries ──────────────────────────────────────────────────────────

/** Look back at most this far, so a missed day is caught up but old history isn't. */
const DIGEST_LOOKBACK_DAYS = 7;

const DECISION_LABELS: Record<string, string> = {
  APPROVE: "Approved",
  REJECT: "Corrections requested",
  RETURN: "Returned to the previous phase",
};

function formatDate(value: Date): string {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Lagos",
  });
}

export type DigestResult = {
  transitions: number;
  adminEmails: number;
  hodEmails: number;
  failed: number;
};

/**
 * Sends the daily summary emails for review activity that hasn't been
 * summarised yet, then marks that activity as sent. Safe to run more than
 * once a day: activity is only ever included in one summary.
 */
export async function sendDailyDigests(now = new Date()): Promise<DigestResult> {
  const result: DigestResult = { transitions: 0, adminEmails: 0, hodEmails: 0, failed: 0 };
  if (!isEmailConfigured()) return result;

  const since = new Date(now.getTime() - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const transitions = await prisma.phaseTransition.findMany({
    where: { notifiedAt: null, transitionedAt: { gte: since, lte: now } },
    orderBy: { transitionedAt: "asc" },
    select: {
      id: true,
      action: true,
      fromPhase: true,
      toPhase: true,
      remarks: true,
      transitionedAt: true,
      performedById: true,
      performedBy: { select: { firstName: true, lastName: true } },
      submission: {
        select: {
          id: true,
          status: true,
          programme: {
            select: {
              name: true,
              department: { select: { id: true, name: true } },
            },
          },
          createdBy: { select: { id: true, email: true, role: true, isActive: true } },
        },
      },
    },
  });
  result.transitions = transitions.length;
  if (transitions.length === 0) return result;

  const site = getSiteUrl();
  const submissionLink = (id: string) => `${site}/submissions/${id}`;
  const actorName = (t: (typeof transitions)[number]) =>
    `${t.performedBy.firstName} ${t.performedBy.lastName}`;

  // ── Admins: what was submitted for review ──
  const submits = transitions.filter((t) => t.action === "SUBMIT");
  if (submits.length > 0) {
    const [admins, waiting] = await Promise.all([
      prisma.user.findMany({
        where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
        select: { email: true },
      }),
      prisma.submission.count({ where: { status: "IN_REVIEW" } }),
    ]);

    const items: DigestItem[] = submits.map((t) => ({
      title: t.submission.programme.name,
      lines: [
        `${t.submission.programme.department.name} · submitted by ${actorName(t)} on ${formatDate(t.transitionedAt)}`,
      ],
      link: submissionLink(t.submission.id),
    }));
    const count = submits.length;
    const content = renderDigest({
      heading: `${count} bulletin${count === 1 ? " was" : "s were"} submitted for review`,
      intro: "These were submitted since the last summary:",
      items,
      footer: `${waiting} submission${waiting === 1 ? " is" : "s are"} waiting for review in total.`,
      link: `${site}/submissions`,
      linkLabel: "Open submissions",
    });

    for (const admin of admins) {
      const ok = await sendEmail({
        to: [admin.email],
        subject: `Daily summary: ${count} new submission${count === 1 ? "" : "s"} to review`,
        ...content,
      });
      if (ok) result.adminEmails++;
      else result.failed++;
    }
  }

  // ── HODs: review decisions on their department's bulletins ──
  const decisions = transitions.filter((t) => t.action in DECISION_LABELS);
  if (decisions.length > 0) {
    const departmentIds = [
      ...new Set(decisions.map((t) => t.submission.programme.department.id)),
    ];
    const hods = await prisma.user.findMany({
      where: { role: "HOD", isActive: true, departmentId: { in: departmentIds } },
      select: { id: true, email: true, departmentId: true },
    });

    // Group decisions by recipient. The department's HOD(s) get them; if a
    // department has no active HOD, the HOD who created the submission does.
    const byRecipient = new Map<string, { email: string; items: DigestItem[] }>();
    for (const t of decisions) {
      const deptId = t.submission.programme.department.id;
      let recipients = hods.filter((h) => h.departmentId === deptId);
      const creator = t.submission.createdBy;
      if (recipients.length === 0 && creator.role === "HOD" && creator.isActive) {
        recipients = [{ id: creator.id, email: creator.email, departmentId: deptId }];
      }
      const finalApproval = t.action === "APPROVE" && t.toPhase === 11;
      const item: DigestItem = {
        title: t.submission.programme.name,
        lines: [
          `${finalApproval ? "Final approval" : DECISION_LABELS[t.action]} by ${actorName(t)} on ${formatDate(t.transitionedAt)}`,
          `Now at phase ${t.toPhase}: ${PHASE_NAMES[t.toPhase] ?? ""}`,
        ],
        remarks: t.remarks,
        link: submissionLink(t.submission.id),
        needsAction: t.action === "REJECT" || t.action === "RETURN",
      };
      for (const r of recipients) {
        if (r.id === t.performedById) continue; // don't tell people about their own actions
        const entry = byRecipient.get(r.id) ?? { email: r.email, items: [] };
        entry.items.push(item);
        byRecipient.set(r.id, entry);
      }
    }

    for (const { email, items } of byRecipient.values()) {
      const needsAction = items.some((i) => i.needsAction);
      const content = renderDigest({
        heading: needsAction
          ? "Your bulletin needs changes"
          : "Updates on your bulletin",
        intro: needsAction
          ? "Reviewers have asked for changes. Open the submission to see the remarks, make the changes and resubmit."
          : "Here's what happened to your department's bulletin since the last summary:",
        items,
        link: `${site}/submissions/me`,
        linkLabel: "Open my submission",
      });
      const ok = await sendEmail({
        to: [email],
        subject: needsAction
          ? "Daily summary: changes requested on your bulletin"
          : "Daily summary: updates on your bulletin",
        ...content,
      });
      if (ok) result.hodEmails++;
      else result.failed++;
    }
  }

  // Mark everything in this batch as summarised, including actions nobody
  // needed to hear about, so it isn't picked up again tomorrow.
  await prisma.phaseTransition.updateMany({
    where: { id: { in: transitions.map((t) => t.id) } },
    data: { notifiedAt: now },
  });

  return result;
}

// ── New user access ──────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  HOD: "Head of Department",
  DEAN: "Dean",
  ADMIN: "Administrator",
  SUPER_ADMIN: "Super Administrator",
};

/**
 * Tells someone an administrator gave them access. Returns whether the email
 * was sent. Never throws.
 */
export async function sendAccessGrantedEmail(opts: {
  to: string;
  firstName: string;
  role: string;
}): Promise<boolean> {
  if (!isEmailConfigured()) return false;

  const link = `${getSiteUrl()}/login`;
  const content = renderEmail({
    heading: "You've been given access to the Academic Bulletin",
    intro: `Hello ${opts.firstName}, an administrator has added you to the Academic Bulletin system. Sign in with the Google account that uses this email address. There is no password to set up.`,
    details: [
      ["Email", opts.to],
      ["Role", ROLE_LABELS[opts.role] ?? opts.role],
    ],
    link,
    linkLabel: "Sign in with Google",
  });

  return sendEmail({
    to: [opts.to],
    subject: "Your Academic Bulletin access",
    ...content,
  });
}
