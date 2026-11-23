import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendDailyDigests } from "@/lib/email/notifications";
import { processPendingGraceAssessments } from "@/lib/courses/grace-compliance";
import { pruneRateLimits } from "@/lib/rate-limit";
import { sendDueInvitations } from "@/lib/people/invitations";

// Sending one summary email per recipient can take a little while.
export const maxDuration = 60;

// Leaves room for the digest emails and one last batch of GRACE checks.
const GRACE_TIME_BUDGET_MS = 30_000;

/**
 * GET /api/cron/daily
 *
 * The app's single daily job, called at 06:00 UTC (07:00 Lagos) by the
 * `daily-job` service in the Railway project: a scheduled curl that exits
 * after the call, and marks the run failed when this answers with an error.
 * It does several independent things, so one failing doesn't stop the rest:
 *
 * 1. Health check: confirms the database answers (reported as keepAlive).
 * 2. Daily summary emails to admins and HODs (lib/email/notifications.ts).
 * 3. GRACE checks still queued, so none waits longer than a day.
 * 4. Removing expired AI rate-limit counts.
 * 5. Invitations still waiting, once their launch time has passed (D3).
 *
 * Protected by CRON_SECRET, sent as `Authorization: Bearer ...`. The daily-job
 * service reads it from the website service's variable, so the two can't
 * drift apart.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let keepAlive: { ok: boolean; users?: number; expiredRateLimits?: number | null } = {
    ok: false,
  };
  try {
    const users = await prisma.user.count();
    // Housekeeping; a failure here is only logged.
    const expiredRateLimits = await pruneRateLimits().catch((pruneError) => {
      console.error("Pruning AI rate limits failed:", pruneError);
      return null;
    });
    keepAlive = { ok: true, users, expiredRateLimits };
  } catch (error) {
    console.error("Keep-alive failed:", error);
  }

  // D3: the invitations wait for 8:00 am WAT, Thursday, November 26, 2026;
  // from then on, anyone still waiting gets theirs on the next run.
  let invitations: Record<string, unknown> = { ok: false };
  try {
    const { due, results } = await sendDueInvitations();
    invitations = {
      ok: true,
      due,
      sent: results.filter((result) => result.sent).length,
      failed: results.filter((result) => !result.sent).map((result) => ({ email: result.email, reason: result.reason })),
    };
  } catch (error) {
    console.error("Invitations failed:", error);
  }

  let digest: Record<string, unknown> = { ok: false };
  try {
    digest = { ok: true, ...(await sendDailyDigests()) };
  } catch (error) {
    console.error("Daily digest failed:", error);
  }

  // Work through the GRACE backlog in batches: bulletins that can still be
  // submitted first, then everything else, stopping well before the time limit.
  let grace: Record<string, unknown> = { ok: false };
  try {
    const deadline = Date.now() + GRACE_TIME_BUDGET_MS;
    let processed = 0;
    for (const activeOnly of [true, false]) {
      while (Date.now() < deadline) {
        const batch = await processPendingGraceAssessments({
          limit: 10,
          activeOnly,
        });
        processed += batch.processed;
        if (batch.processed === 0) break;
      }
    }
    grace = { ok: true, processed };
  } catch (error) {
    console.error("Queued GRACE processing failed:", error);
  }

  const ok = keepAlive.ok && digest.ok === true && grace.ok === true && invitations.ok === true;
  return NextResponse.json(
    { ok, keepAlive, invitations, digest, grace, at: new Date().toISOString() },
    { status: ok ? 200 : 500 },
  );
}
