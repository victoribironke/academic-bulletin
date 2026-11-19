/**
 * Per-person limits on the endpoints that call the AI service (each call
 * costs money) and on two-step verification codes (so they can't be
 * guessed). Counts live in the database, so every server instance shares
 * them.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const AI_RATE_LIMITS = {
  /** One course description or the philosophy, checked on request. */
  graceCheck: { limit: 10, windowSeconds: 60 },
  /** A batch of up to three queued course checks. */
  graceQueue: { limit: 12, windowSeconds: 60 },
  /** A staff or programme photo reviewed on upload. */
  imageReview: { limit: 10, windowSeconds: 60 },
} as const;

export type AiRateLimit = keyof typeof AI_RATE_LIMITS;

/**
 * Authenticator and recovery code attempts, per person. Three codes are valid
 * at any moment (for clock drift), so at 20 tries a day a guesser would need
 * about 45 years on average.
 */
export const MFA_RATE_LIMITS = {
  mfaCode: { limit: 5, windowSeconds: 5 * 60 },
  mfaCodeDaily: { limit: 20, windowSeconds: 24 * 60 * 60 },
} as const;

const RATE_LIMITS = { ...AI_RATE_LIMITS, ...MFA_RATE_LIMITS };

export type RateLimitName = keyof typeof RATE_LIMITS;

export type RateLimitDecision =
  | { ok: true; remaining: number; count: number }
  | { ok: false; retryAfterSeconds: number; count: number };

/** Counts one call against the limit and says whether it may go ahead. */
export async function takeRateLimit(
  name: RateLimitName,
  userId: string,
  now: Date = new Date(),
): Promise<RateLimitDecision> {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  const windowMs = windowSeconds * 1000;
  const window = Math.floor(now.getTime() / windowMs);
  const key = `${name}:${userId}:${window}`;
  const expiresAt = new Date((window + 1) * windowMs);

  // One atomic statement, so simultaneous calls can't both see a free slot.
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "api_rate_limits" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "api_rate_limits"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? Number.POSITIVE_INFINITY);

  if (count <= limit) return { ok: true, remaining: limit - count, count };
  return {
    ok: false,
    count,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
    ),
  };
}

/**
 * The 429 response to send when the person is over the limit, or null when
 * the call may go ahead.
 */
export async function aiRateLimitResponse(
  name: AiRateLimit,
  userId: string,
): Promise<NextResponse | null> {
  const decision = await takeRateLimit(name, userId);
  if (decision.ok) return null;
  return NextResponse.json(
    {
      error:
        "Too many AI checks in a short time. Please wait a minute and try again.",
      code: "RATE_LIMITED",
      retryAfterSeconds: decision.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(decision.retryAfterSeconds) },
    },
  );
}

/** Removes counts whose window has passed. Run by the daily job. */
export async function pruneRateLimits(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.apiRateLimit.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return count;
}
