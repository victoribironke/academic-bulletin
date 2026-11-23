/**
 * "Remember this device for 30 days" (work order task D11, DEC18).
 *
 * Ticking the box when entering a code stores a random token in an
 * HttpOnly cookie on this browser; the database keeps only its SHA-256 hash.
 * At a later sign-in on the same browser, the verify page finds the cookie,
 * checks it belongs to the person signing in and hasn't expired, and records
 * the check for this sign-in without asking for a code. Resetting someone's
 * two-step verification forgets every device they had remembered.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const TRUSTED_DEVICE_DAYS = 30;
export const TRUSTED_DEVICE_MS = TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000;
export const TRUSTED_DEVICE_COOKIE = "abrs_trusted_device";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Cookie settings: this site only, never readable by page scripts. */
export function trustedDeviceCookie(value: string, now: Date = new Date()) {
  return {
    name: TRUSTED_DEVICE_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(now.getTime() + TRUSTED_DEVICE_MS),
  };
}

/** Remembers this browser for the person; returns the cookie's value. */
export async function rememberDevice(
  tx: Prisma.TransactionClient,
  userId: string,
  userAgent: string | null,
  now: Date = new Date(),
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await tx.mfaTrustedDevice.create({
    data: {
      userId,
      tokenHash: hash(token),
      expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_MS),
      userAgent: userAgent?.slice(0, 200) ?? null,
    },
  });
  // Expired devices are cleared out as new ones arrive.
  await tx.mfaTrustedDevice.deleteMany({ where: { userId, expiresAt: { lt: now } } });
  return token;
}

/** The remembered device this cookie names, if it is the person's and still valid. */
export async function findTrustedDevice(
  tx: Prisma.TransactionClient,
  userId: string,
  cookieValue: string | undefined,
  now: Date = new Date(),
): Promise<{ id: string } | null> {
  if (!cookieValue || cookieValue.length > 200) return null;
  const device = await tx.mfaTrustedDevice.findUnique({
    where: { tokenHash: hash(cookieValue) },
    select: { id: true, userId: true, expiresAt: true },
  });
  if (!device || device.userId !== userId || device.expiresAt <= now) return null;
  await tx.mfaTrustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: now } });
  return { id: device.id };
}

/** Forgets every device the person remembered (on a reset). */
export async function forgetDevices(tx: Prisma.TransactionClient, userId: string): Promise<number> {
  return (await tx.mfaTrustedDevice.deleteMany({ where: { userId } })).count;
}
