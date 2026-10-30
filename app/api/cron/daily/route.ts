import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDailyDigests } from "@/lib/email/notifications";

// Sending one summary email per recipient can take a little while.
export const maxDuration = 60;

/**
 * GET /api/cron/daily
 *
 * The app's single daily job, called by Vercel Cron at 06:00 UTC
 * (07:00 Lagos) - see vercel.json. It does two independent things, so one
 * failing doesn't stop the other:
 *
 * 1. Keep-alive: Supabase's free plan pauses projects after 7 days without
 *    activity, and this app can sit idle between bulletin cycles. Touching
 *    the database and the Supabase API counts as activity.
 * 2. Daily summary emails to admins and HODs (lib/email/notifications.ts).
 *
 * Protected by CRON_SECRET, which Vercel sends as `Authorization: Bearer ...`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let keepAlive: { ok: boolean; users?: number } = { ok: false };
  try {
    const users = await prisma.user.count();
    const { error } = await createAdminClient().storage.listBuckets();
    if (error) throw error;
    keepAlive = { ok: true, users };
  } catch (error) {
    console.error("Keep-alive failed:", error);
  }

  let digest: Record<string, unknown> = { ok: false };
  try {
    digest = { ok: true, ...(await sendDailyDigests()) };
  } catch (error) {
    console.error("Daily digest failed:", error);
  }

  const ok = keepAlive.ok && digest.ok === true;
  return NextResponse.json(
    { ok, keepAlive, digest, at: new Date().toISOString() },
    { status: ok ? 200 : 500 },
  );
}
