import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendDailyDigests } from "@/lib/email/notifications";
import { processPendingGraceAssessments } from "@/lib/courses/grace-compliance";
import { pruneRateLimits } from "@/lib/rate-limit";

// Sending one summary email per recipient can take a little while.
export const maxDuration = 60;

// Leaves room for the digest emails and one last batch of GRACE checks.
const GRACE_TIME_BUDGET_MS = 30_000;

/**
 * GET /api/cron/daily
 *
 * The app's single daily job, called by Vercel Cron at 06:00 UTC
 * (07:00 Lagos) - see vercel.json. It does two independent things, so one
 * failing doesn't stop the other:
 *
 * 1. Health check: confirms the database answers (reported as keepAlive).
 * 2. Daily summary emails to admins and HODs (lib/email/notifications.ts).
 * 3. GRACE checks still queued, so none waits longer than a day.
 * 4. Removing expired AI rate-limit counts.
 *
 * Protected by CRON_SECRET, which Vercel sends as `Authorization: Bearer ...`.
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

  const ok = keepAlive.ok && digest.ok === true && grace.ok === true;
  return NextResponse.json(
    { ok, keepAlive, digest, grace, at: new Date().toISOString() },
    { status: ok ? 200 : 500 },
  );
}
