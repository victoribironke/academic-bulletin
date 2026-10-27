import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/keep-alive
 *
 * Called once a day by Vercel Cron (see vercel.json). Supabase's free plan
 * pauses projects after 7 days without activity, and this app can sit idle
 * between bulletin cycles. Touching both the database and the Supabase API
 * counts as activity.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically when the
 * CRON_SECRET environment variable is set.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.user.count();
    const { error } = await createAdminClient().storage.listBuckets();
    if (error) throw error;

    return NextResponse.json({ ok: true, users, at: new Date().toISOString() });
  } catch (error) {
    console.error("Keep-alive failed:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
