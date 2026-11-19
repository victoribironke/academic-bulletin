/**
 * Keeps two-step verification secrets out of reach of anyone who only has
 * the database. Authenticator secrets are encrypted, and recovery codes are
 * stored only as keyed hashes, both with keys derived from
 * MFA_ENCRYPTION_KEY, which lives in the hosting settings, never in the
 * database.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
} from "node:crypto";

export const MFA_KEY_ENV = "MFA_ENCRYPTION_KEY";
export const RECOVERY_CODE_COUNT = 10;

/** Thrown when the server has no usable MFA_ENCRYPTION_KEY. */
export class MfaNotConfiguredError extends Error {
  constructor(detail: string) {
    super(`Two-step verification isn't configured: ${detail}`);
    this.name = "MfaNotConfiguredError";
  }
}

function masterKey(): Buffer {
  const raw = process.env[MFA_KEY_ENV]?.trim();
  if (!raw) throw new MfaNotConfiguredError(`${MFA_KEY_ENV} is not set.`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw) {
    throw new MfaNotConfiguredError(
      `${MFA_KEY_ENV} must be 32 random bytes in base64 (openssl rand -base64 32).`,
    );
  }
  return key;
}

function subkey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey(), Buffer.alloc(0), purpose, 32));
}

export function isMfaConfigured(): boolean {
  try {
    masterKey();
    return true;
  } catch {
    return false;
  }
}

const VERSION = "v1";

/**
 * Encrypts an authenticator secret for one user. The user id is bound in,
 * so a secret copied onto another account won't decrypt.
 */
export function encryptMfaSecret(secret: Uint8Array, userId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", subkey("mfa-secret"), iv);
  cipher.setAAD(Buffer.from(`mfa-secret:${userId}`));
  const body = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, body].map((part) =>
    typeof part === "string" ? part : part.toString("base64url"),
  ).join(".");
}

export function decryptMfaSecret(stored: string, userId: string): Buffer {
  const [version, iv, tag, body] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error("Unrecognised two-step verification secret");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    subkey("mfa-secret"),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(`mfa-secret:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]);
}

// No 0/O, 1/I/L or U, so codes read back without mistakes (Crockford's set).
const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_LENGTH = 10;

/** Ten one-time codes like "7K2QD-X9M4F" (50 random bits each). */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let code = "";
    for (let i = 0; i < RECOVERY_LENGTH; i++) {
      code += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    }
    codes.add(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return [...codes];
}

/**
 * The code as stored, ignoring case, spaces and dashes, and reading O as 0
 * and I or L as 1. Null when it can't be a recovery code.
 */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (code.length !== RECOVERY_LENGTH) return null;
  for (const char of code) if (!RECOVERY_ALPHABET.includes(char)) return null;
  return code;
}

/** The keyed hash stored in place of a recovery code. */
export function hashRecoveryCode(code: string, userId: string): string {
  const normalized = normalizeRecoveryCode(code);
  if (!normalized) throw new Error("Not a recovery code");
  return createHmac("sha256", subkey("mfa-recovery-codes"))
    .update(`${userId}:${normalized}`)
    .digest("hex");
}
