/**
 * Workflow notification emails.
 *
 * Who gets emailed:
 *  - SUBMIT  → every active Admin / Super Admin (they review submissions).
 *  - REJECT / RETURN → the person who created the submission, with the remarks.
 *  - APPROVE at the final phase → the person who created the submission.
 *
 * Intermediate phase approvals are not emailed, to stay well inside the
 * Resend free plan's 100-emails-a-day limit. The person who performed the
 * action is never emailed about it.
 */
import prisma from "@/lib/prisma";
import { getSiteUrl } from "@/lib/supabase/config";
import { isEmailConfigured, sendEmail } from "./resend";

const PHASE_NAMES: Record<number, string> = {
  1: "Preparation",
  2: "Dept Review",
  3: "School",
  4: "Academic Planning",
  5: "Corrections",
  6: "Consolidation",
  7: "Senate",
  8: "Editing",
  9: "Typesetting",
  10: "Distribution",
  11: "Post-Release",
};

type TransitionEvent = {
  submissionId: string;
  action: string;
  toPhase: number;
  newStatus: string;
  remarks?: string | null;
  actorId: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmail(opts: {
  heading: string;
  intro: string;
  details: Array<[string, string]>;
  remarks?: string | null;
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
  const remarksHtml = opts.remarks?.trim()
    ? `<div style="margin:16px 0;padding:12px 16px;border-left:4px solid #e3b122;background:#fdf8e7;color:#0f172a;white-space:pre-wrap">${escapeHtml(opts.remarks.trim())}</div>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
<div style="background:#003cbb;color:#ffffff;padding:16px 24px;font-size:16px;font-weight:700">Academic Bulletin</div>
<div style="padding:24px">
<h1 style="margin:0 0 12px;font-size:18px;color:#003cbb">${escapeHtml(opts.heading)}</h1>
<p style="margin:0 0 16px;color:#334155;line-height:1.5">${escapeHtml(opts.intro)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows}</table>
${remarksHtml}
<p style="margin:24px 0 0"><a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#003cbb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">${escapeHtml(opts.linkLabel)}</a></p>
</div></div></body></html>`;

  const text = [
    opts.heading,
    "",
    opts.intro,
    "",
    ...opts.details.map(([label, value]) => `${label}: ${value}`),
    ...(opts.remarks?.trim() ? ["", "Remarks:", opts.remarks.trim()] : []),
    "",
    `${opts.linkLabel}: ${opts.link}`,
  ].join("\n");

  return { html, text };
}

/** Sends the emails for a submission status change. Never throws. */
export async function notifySubmissionTransition(
  event: TransitionEvent,
): Promise<void> {
  if (!isEmailConfigured()) return;

  try {
    const submission = await prisma.submission.findUnique({
      where: { id: event.submissionId },
      select: {
        id: true,
        title: true,
        createdBy: { select: { id: true, email: true, isActive: true } },
        programme: {
          select: {
            name: true,
            department: { select: { name: true } },
          },
        },
      },
    });
    if (!submission) return;

    const actor = await prisma.user.findUnique({
      where: { id: event.actorId },
      select: { firstName: true, lastName: true },
    });
    const actorName = actor ? `${actor.firstName} ${actor.lastName}` : "A user";

    const link = `${getSiteUrl()}/submissions/${submission.id}`;
    const details: Array<[string, string]> = [
      ["Bulletin", submission.title],
      ["Programme", submission.programme.name],
      ["Department", submission.programme.department.name],
      ["Stage", `Phase ${event.toPhase}: ${PHASE_NAMES[event.toPhase] ?? ""}`],
    ];

    let recipients: string[] = [];
    let subject = "";
    let content: { html: string; text: string } | null = null;

    if (event.action === "SUBMIT") {
      const reviewers = await prisma.user.findMany({
        where: {
          role: { in: ["ADMIN", "SUPER_ADMIN"] },
          isActive: true,
          id: { not: event.actorId },
        },
        select: { email: true },
      });
      recipients = reviewers.map((r) => r.email);
      subject = `Submitted for review: ${submission.title}`;
      content = renderEmail({
        heading: "A bulletin was submitted for review",
        intro: `${actorName} submitted this bulletin and it is waiting for review.`,
        details,
        link,
        linkLabel: "Review submission",
      });
    } else if (event.action === "REJECT" || event.action === "RETURN") {
      subject = `Corrections required: ${submission.title}`;
      content = renderEmail({
        heading: "Corrections are required",
        intro: `${actorName} returned this bulletin for corrections. Please review the remarks, make the changes and resubmit.`,
        details,
        remarks: event.remarks,
        link,
        linkLabel: "Open submission",
      });
    } else if (event.action === "APPROVE" && event.newStatus === "APPROVED") {
      subject = `Approved: ${submission.title}`;
      content = renderEmail({
        heading: "Your bulletin has been approved",
        intro: `${actorName} gave the final approval for this bulletin.`,
        details,
        link,
        linkLabel: "View submission",
      });
    }

    if (event.action !== "SUBMIT") {
      const creator = submission.createdBy;
      if (creator.isActive && creator.id !== event.actorId) {
        recipients = [creator.email];
      }
    }

    if (!content || recipients.length === 0) return;

    // One email per person so recipients don't see each other's addresses.
    for (const to of new Set(recipients)) {
      await sendEmail({ to: [to], subject, ...content });
    }
  } catch (error) {
    console.error("[email] Workflow notification failed:", error);
  }
}
