import { afterEach, describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  formatSecretForTyping,
  matchTotpStep,
  normalizeTotpCode,
  otpauthUri,
  totpCode,
  totpStep,
} from "@/lib/mfa/totp";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  isMfaConfigured,
  MfaNotConfiguredError,
  normalizeRecoveryCode,
} from "@/lib/mfa/secrets";
import { MFA_SESSION_MS, mfaRequiredFor, mfaStateOf, safeNextPath } from "@/lib/mfa/policy";
import { qrCodeDataUrl } from "@/lib/mfa/qr";

// RFC 6238 appendix B, SHA-1 seed, last six of the eight digits.
const rfcSecret = Buffer.from("12345678901234567890");
const rfcVectors: Array<[number, string]> = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

describe("authenticator codes", () => {
  it("match the RFC 6238 test values", () => {
    for (const [seconds, code] of rfcVectors) {
      expect(totpCode(rfcSecret, totpStep(seconds * 1000))).toBe(code);
    }
  });

  it("encode base32 as RFC 4648 does, both ways", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb oi").toString()).toBe("foobar");
    expect(base32Decode(base32Encode(rfcSecret))).toEqual(rfcSecret);
    expect(() => base32Decode("not base32!")).toThrow();
  });

  it("accept one step of clock drift either way, and no more", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    for (const offset of [-1, 0, 1]) {
      expect(matchTotpStep(rfcSecret, totpCode(rfcSecret, step + offset), now)).toBe(step + offset);
    }
    for (const offset of [-2, 2]) {
      expect(matchTotpStep(rfcSecret, totpCode(rfcSecret, step + offset), now)).toBeNull();
    }
  });

  it("refuse a code from a step already used", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = totpCode(rfcSecret, step);
    expect(matchTotpStep(rfcSecret, code, now, step - 1)).toBe(step);
    expect(matchTotpStep(rfcSecret, code, now, step)).toBeNull();
    expect(matchTotpStep(rfcSecret, code, now, step + 1)).toBeNull();
  });

  it("take six digits, with spaces, and nothing else", () => {
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
    for (const value of ["12345", "1234567", "12a456", "", null, 123456]) {
      expect(normalizeTotpCode(value)).toBeNull();
    }
  });

  it("give the app an otpauth address with the issuer and account", () => {
    const uri = new URL(otpauthUri(rfcSecret, "staff@babcock.edu.ng"));
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.host).toBe("totp");
    expect(decodeURIComponent(uri.pathname)).toBe("/Academic Bulletin:staff@babcock.edu.ng");
    expect(uri.searchParams.get("secret")).toBe(base32Encode(rfcSecret));
    expect(uri.searchParams.get("issuer")).toBe("Academic Bulletin");
    expect(uri.searchParams.get("digits")).toBe("6");
    expect(formatSecretForTyping(rfcSecret)).toMatch(/^([A-Z2-7]{4} )+[A-Z2-7]{1,4}$/);
  });

  it("draw a QR code as an SVG data URL", () => {
    const url = qrCodeDataUrl("otpauth://totp/Test:a@b.c?secret=ABC");
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true);
    const svg = Buffer.from(url.split(",")[1], "base64").toString();
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 \d+ \d+"/);
    expect(svg).toContain('<path d="M');
  });
});

describe("stored secrets", () => {
  const savedKey = process.env.MFA_ENCRYPTION_KEY;
  afterEach(() => {
    process.env.MFA_ENCRYPTION_KEY = savedKey;
  });

  it("encrypt the authenticator secret for one user only", () => {
    const stored = encryptMfaSecret(rfcSecret, "user-1");
    expect(stored).toMatch(/^v1\./);
    expect(stored).not.toContain(base32Encode(rfcSecret));
    expect(encryptMfaSecret(rfcSecret, "user-1")).not.toBe(stored);
    expect(decryptMfaSecret(stored, "user-1")).toEqual(rfcSecret);
    expect(() => decryptMfaSecret(stored, "user-2")).toThrow();

    const [version, iv, tag, body] = stored.split(".");
    const flipped = Buffer.from(body, "base64url");
    flipped[0] ^= 1;
    expect(() =>
      decryptMfaSecret([version, iv, tag, flipped.toString("base64url")].join("."), "user-1"),
    ).toThrow();
  });

  it("refuse to work without a proper 32-byte key", () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    expect(isMfaConfigured()).toBe(false);
    expect(() => encryptMfaSecret(rfcSecret, "user-1")).toThrow(MfaNotConfiguredError);
    for (const key of ["short", Buffer.alloc(16).toString("base64"), "x".repeat(44)]) {
      process.env.MFA_ENCRYPTION_KEY = key;
      expect(isMfaConfigured()).toBe(false);
    }
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(isMfaConfigured()).toBe(true);
  });

  it("can't be decrypted with another key", () => {
    const stored = encryptMfaSecret(rfcSecret, "user-1");
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    expect(() => decryptMfaSecret(stored, "user-1")).toThrow();
  });

  it("make ten different recovery codes that read back without mistakes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);

    expect(normalizeRecoveryCode(" 7k2qd x9m4f ")).toBe("7K2QDX9M4F");
    expect(normalizeRecoveryCode("O0IL1-abcde")).toBe("00111ABCDE");
    for (const value of ["7K2QD-X9M4", "7K2QD-X9M4FF", "7K2QD-X9M4U", "", null]) {
      expect(normalizeRecoveryCode(value)).toBeNull();
    }
  });

  it("store recovery codes only as keyed hashes, per user", () => {
    const hash = hashRecoveryCode("7K2QD-X9M4F", "user-1");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode("7k2qd x9m4f", "user-1")).toBe(hash);
    expect(hashRecoveryCode("7K2QD-X9M4F", "user-2")).not.toBe(hash);
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    expect(hashRecoveryCode("7K2QD-X9M4F", "user-1")).not.toBe(hash);
  });
});

describe("two-step policy", () => {
  it("applies to everyone, Heads and Deans included (DEC18)", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "DEAN", "HOD", "PROGRAMME_COORDINATOR"]) {
      expect(mfaRequiredFor(role)).toBe(true);
    }
  });

  it("treats a check as lasting 12 hours, and anything unclear as pending", () => {
    const now = 10 * MFA_SESSION_MS;
    expect(mfaStateOf({ mfa: "none" }, now)).toBe("none");
    expect(mfaStateOf({ mfa: "verified", mfaVerifiedAt: now - 1000 }, now)).toBe("verified");
    expect(mfaStateOf({ mfa: "verified", mfaVerifiedAt: now - MFA_SESSION_MS }, now)).toBe("pending");
    expect(mfaStateOf({ mfa: "verified" }, now)).toBe("pending");
    expect(mfaStateOf({ mfa: "pending" }, now)).toBe("pending");
    expect(mfaStateOf({}, now)).toBe("pending");
  });

  it("only goes on to a page on this site after the code", () => {
    expect(safeNextPath("/users?tab=2")).toBe("/users?tab=2");
    for (const value of [
      undefined,
      ["/users"],
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/login",
      "/verify?next=/users",
      "/api/users/me",
    ]) {
      expect(safeNextPath(value)).toBe("/dashboard");
    }
  });
});
