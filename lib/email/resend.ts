/**
 * Minimal Resend client (https://resend.com/docs/api-reference/emails/send-email).
 * Uses fetch directly so no extra dependency is needed.
 */
import { EMAIL_FROM } from "@/lib/site-config";
import { isTestSite } from "@/lib/environment";

export type EmailMessage = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  /** A different sender name on the site's verified address (DEC7). */
  fromName?: string;
  /** Where replies go. */
  replyTo?: string[];
};

/** The site's sender, with another display name when given. */
export function senderFor(fromName: string | undefined): string {
  if (!fromName) return EMAIL_FROM;
  const address = EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? EMAIL_FROM;
  return `${fromName.replace(/[<>"]/g, "")} <${address}>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

/**
 * On the test site (task A1) an email goes only to the DAP test inbox, marked
 * as a test and naming who it would have reached on the live site. With no
 * test inbox set, nothing is sent at all (null).
 */
export function testSiteEmail(message: EmailMessage, testInbox: string | undefined): EmailMessage | null {
  const inbox = testInbox?.trim();
  if (!inbox) return null;
  const wouldHaveReached = message.to.join(", ") || "nobody";
  return {
    ...message,
    to: [inbox],
    subject: `[TEST SITE] ${message.subject}`,
    text: `Sent by the ABRS test site. On the live site this would have gone to: ${wouldHaveReached}\n\n${message.text}`,
    html:
      `<p style="padding:8px;background:#fef3c7;border:1px solid #f59e0b">` +
      `Sent by the ABRS test site. On the live site this would have gone to: ${escapeHtml(wouldHaveReached)}</p>` +
      message.html,
  };
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Sends one email. Returns false (and logs) instead of throwing, so a mail
 * problem never breaks the action that triggered it.
 */
export async function sendEmail(original: EmailMessage): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set; skipping send.");
    return false;
  }
  if (original.to.length === 0) return true;

  let message = original;
  if (isTestSite()) {
    const redirected = testSiteEmail(original, process.env.TEST_EMAIL_INBOX);
    if (!redirected) {
      console.warn(`[email] Test site with no TEST_EMAIL_INBOX; not sending "${original.subject}".`);
      return true;
    }
    message = redirected;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: senderFor(message.fromName),
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.replyTo?.length && { reply_to: message.replyTo }),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[email] Resend returned ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] Failed to send:", error);
    return false;
  }
}
