import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendDailyDigests } from "@/lib/email/notifications";
import { isMissingSearchTable, refreshSearchIndex } from "@/lib/search/sync";
import { processPendingGraceAssessments } from "@/lib/courses/grace-compliance";
import { pruneRateLimits } from "@/lib/rate-limit";
import { sendDueInvitations } from "@/lib/people/invitations";
import { runAgent } from "@/lib/agent/run";
import { isNotSwitchedOn } from "@/lib/courses/course-list";
import { dailyWorkDue } from "@/lib/agent/rules";

// Sending one summary email per recipient can take a little while.
export const maxDuration = 60;

// Leaves room for the digest emails and one last batch of GRACE checks.
const GRACE_TIME_BUDGET_MS = 30_000;

/**
 * GET /api/cron/daily
 *
 * The app's daily job, called by the `daily-job` service in the Railway
 * project at 06:00 and 07:00 UTC (7:00 and 8:00 am in Lagos): a scheduled curl
 * that exits after the call, and marks the run failed when this answers with
 * an error.
 *
 * Every call runs the reminder agent (T3): it prepares the day's messages at
 * 7:00 and sends those DAP hasn't held at 8:00, if sending is switched on.
 * The rest runs once a day, at the 8:00 call. It does several independent
 * things, so one failing doesn't stop the rest:
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

  // T3: the reminder agent, on every call (prepare at 7:00, send at 8:00).
  const now = new Date();
  let agent: Record<string, unknown> = { ok: false };
  try {
    agent = { ok: true, ...(await runAgent(now)) };
  } catch (error) {
    agent = { ok: false, switchedOn: !isNotSwitchedOn(error) };
    if (!isNotSwitchedOn(error)) console.error("The reminder agent's run failed:", error);
  }
  // Everything else waits for the 8:00 am call, so it runs once a day.
  if (!dailyWorkDue(now)) {
    return NextResponse.json({ ok: true, agent, dailyWork: "Runs at the 8:00 am call.", at: now.toISOString() });
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

  // K1: rebuild the search table in full once a day (searches refresh what
  // changed in between). Not counted against "ok": search can wait a day.
  let search: Record<string, unknown> = { ok: false };
  try {
    search = { ok: true, ...(await refreshSearchIndex({ full: true })) };
  } catch (error) {
    search = { ok: false, switchedOn: !isMissingSearchTable(error) };
    if (!isMissingSearchTable(error)) console.error("Search refresh failed:", error);
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
    { ok, keepAlive, invitations, digest, grace, search, agent, at: new Date().toISOString() },
    { status: ok ? 200 : 500 },
  );
}
