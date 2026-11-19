/**
 * Authenticator-app codes (TOTP, RFC 6238): six digits that change every 30
 * seconds, worked out from a secret the app and the server share. Works with
 * Google Authenticator, Microsoft Authenticator, 1Password and the like.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Codes from one step either side of now still count, for clock drift. */
export const TOTP_DRIFT_STEPS = 1;
/** The name the authenticator app shows above the code. */
export const TOTP_ISSUER = "Academic Bulletin";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error("Not a base32 string");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, the size RFC 4226 recommends. */
export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export function totpStep(now: number): number {
  return Math.floor(now / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code for one 30-second step. */
export function totpCode(secret: Uint8Array, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/** Six digits, allowing spaces ("123 456"). Null for anything else. */
export function normalizeTotpCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.replace(/\s/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

/**
 * The step the code belongs to, within the drift allowance, or null when it
 * matches none. Steps at or before `lastUsedStep` don't count, so a code
 * can't be used twice. The caller still records the step atomically.
 */
export function matchTotpStep(
  secret: Uint8Array,
  code: string,
  now: number = Date.now(),
  lastUsedStep: number | null = null,
): number | null {
  const given = Buffer.from(code);
  const current = totpStep(now);
  let matched: number | null = null;
  // Check every step in the window, so the time taken doesn't hint at which matched.
  for (let step = current - TOTP_DRIFT_STEPS; step <= current + TOTP_DRIFT_STEPS; step++) {
    const expected = Buffer.from(totpCode(secret, step));
    const same = expected.length === given.length && timingSafeEqual(expected, given);
    if (same && (lastUsedStep === null || step > lastUsedStep)) matched ??= step;
  }
  return matched;
}

/** The address an authenticator app reads from the QR code. */
export function otpauthUri(secret: Uint8Array, accountName: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${accountName}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** The secret in groups of four, for typing into an app by hand. */
export function formatSecretForTyping(secret: Uint8Array): string {
  return base32Encode(secret).match(/.{1,4}/g)!.join(" ");
}
