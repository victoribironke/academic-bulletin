import { describe, expect, it } from "vitest";
import {
  checkSignInAccess,
  isUniversityEmail,
  lagosDate,
  normalizeEmail,
  parseSignInExceptionEnd,
  personalAccountMayUseApp,
} from "@/lib/sign-in-access";

const now = new Date("2026-11-19T10:00:00Z");
const tomorrow = new Date("2026-11-20T10:00:00Z");
const yesterday = new Date("2026-11-18T10:00:00Z");

const google = {
  email: "Staff@Babcock.edu.ng ",
  emailVerified: true,
  hostedDomain: "babcock.edu.ng",
};
const added = {
  id: "user-1",
  email: "staff@babcock.edu.ng",
  isActive: true,
  role: "HOD",
  signInExceptionUntil: null,
};

const personalGoogle = { email: "staff@gmail.com", emailVerified: true, hostedDomain: null };
const personal = { ...added, email: "staff@gmail.com" };

describe("checkSignInAccess", () => {
  it("lets in an active university account an administrator added, ignoring case", () => {
    expect(checkSignInAccess(google, added, now)).toEqual({ ok: true, viaException: false });
    expect(checkSignInAccess(google, { ...added, role: "SUPER_ADMIN" }, now)).toEqual({
      ok: true,
      viaException: false,
    });
  });

  it("rejects an email nobody added", () => {
    expect(checkSignInAccess(google, null, now)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
  });

  it("rejects a deactivated user", () => {
    expect(checkSignInAccess(google, { ...added, isActive: false }, now)).toEqual({
      ok: false,
      reason: "account_deactivated",
    });
  });

  it("rejects a Google account whose email doesn't match the added one", () => {
    expect(
      checkSignInAccess(google, { ...added, email: "someone.else@babcock.edu.ng" }, now),
    ).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("rejects an email Google hasn't verified", () => {
    expect(checkSignInAccess({ ...google, emailVerified: false }, added, now)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
  });

  it("rejects a sign-in with no email", () => {
    expect(
      checkSignInAccess({ email: null, emailVerified: true, hostedDomain: "babcock.edu.ng" }, added, now),
    ).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("treats a university address outside the university's Workspace as personal", () => {
    expect(checkSignInAccess({ ...google, hostedDomain: null }, added, now)).toEqual({
      ok: false,
      reason: "personal_account",
    });
    expect(checkSignInAccess({ ...google, hostedDomain: "gmail.com" }, added, now)).toEqual({
      ok: false,
      reason: "personal_account",
    });
  });

  it("lets a personal account in only while its exception lasts", () => {
    expect(checkSignInAccess(personalGoogle, personal, now)).toEqual({
      ok: false,
      reason: "personal_account",
    });
    expect(
      checkSignInAccess(personalGoogle, { ...personal, signInExceptionUntil: yesterday }, now),
    ).toEqual({ ok: false, reason: "personal_account" });
    expect(
      checkSignInAccess(personalGoogle, { ...personal, signInExceptionUntil: tomorrow }, now),
    ).toEqual({ ok: true, viaException: true });
  });

  it("never lets a personal account in as an admin, exception or not", () => {
    for (const role of ["ADMIN", "SUPER_ADMIN"]) {
      expect(
        checkSignInAccess(
          personalGoogle,
          { ...personal, role, signInExceptionUntil: tomorrow },
          now,
        ),
      ).toEqual({ ok: false, reason: "personal_account_admin" });
    }
  });

  it("doesn't take a look-alike domain for the university's", () => {
    for (const email of ["staff@babcock.edu.ng.evil.com", "staff@notbabcock.edu.ng"]) {
      expect(isUniversityEmail(email)).toBe(false);
    }
    expect(isUniversityEmail(" Staff@BABCOCK.edu.ng")).toBe(true);
  });
});

describe("personalAccountMayUseApp", () => {
  it("needs a live exception and a non-admin role", () => {
    expect(personalAccountMayUseApp({ role: "DEAN", signInExceptionUntil: tomorrow }, now)).toBe(true);
    expect(personalAccountMayUseApp({ role: "DEAN", signInExceptionUntil: yesterday }, now)).toBe(false);
    expect(personalAccountMayUseApp({ role: "DEAN", signInExceptionUntil: null }, now)).toBe(false);
    expect(personalAccountMayUseApp({ role: "ADMIN", signInExceptionUntil: tomorrow }, now)).toBe(false);
  });
});

describe("parseSignInExceptionEnd", () => {
  it("runs an exception to the end of the chosen day in Lagos", () => {
    const result = parseSignInExceptionEnd("2026-12-19", now);
    expect(result).toEqual({ ok: true, until: new Date("2026-12-19T22:59:59.999Z") });
    if (result.ok) expect(lagosDate(result.until)).toBe("2026-12-19");
  });

  it("allows today through 90 days ahead, and nothing else", () => {
    expect(parseSignInExceptionEnd("2026-11-19", now).ok).toBe(true);
    expect(parseSignInExceptionEnd("2027-02-17", now).ok).toBe(true);
    expect(parseSignInExceptionEnd("2027-02-18", now)).toMatchObject({ ok: false });
    expect(parseSignInExceptionEnd("2026-11-18", now)).toEqual({
      ok: false,
      error: "The end date can't be in the past.",
    });
  });

  it("refuses anything that isn't a real date", () => {
    for (const value of ["", "2026-02-30", "19/12/2026", "2026-12-19T10:00", 20261219, null]) {
      expect(parseSignInExceptionEnd(value, now)).toEqual({
        ok: false,
        error: "Choose the date the exception ends.",
      });
    }
  });
});

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  A.B@Example.COM ")).toBe("a.b@example.com");
    expect(normalizeEmail(undefined)).toBe("");
  });
});
