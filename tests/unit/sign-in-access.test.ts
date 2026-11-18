import { describe, expect, it } from "vitest";
import { checkSignInAccess, normalizeEmail } from "@/lib/sign-in-access";

const google = { email: "Staff@Example.com ", emailVerified: true };
const added = { id: "user-1", email: "staff@example.com", isActive: true };

describe("checkSignInAccess", () => {
  it("lets in an active user an administrator added, ignoring case", () => {
    expect(checkSignInAccess(google, added)).toEqual({ ok: true });
  });

  it("rejects an email nobody added", () => {
    expect(checkSignInAccess(google, null)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
  });

  it("rejects a deactivated user", () => {
    expect(checkSignInAccess(google, { ...added, isActive: false })).toEqual({
      ok: false,
      reason: "account_deactivated",
    });
  });

  it("rejects a Google account whose email doesn't match the added one", () => {
    expect(
      checkSignInAccess(google, { ...added, email: "someone.else@example.com" }),
    ).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("rejects an email Google hasn't verified", () => {
    expect(checkSignInAccess({ ...google, emailVerified: false }, added)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
  });

  it("rejects a sign-in with no email", () => {
    expect(checkSignInAccess({ email: null, emailVerified: true }, added)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
  });
});

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  A.B@Example.COM ")).toBe("a.b@example.com");
    expect(normalizeEmail(undefined)).toBe("");
  });
});
