import { describe, expect, it } from "vitest";
import {
  checkSignInAccess,
  rejectionFromProviderError,
} from "@/lib/sign-in-access";

const authUser = { id: "user-1", email: "Staff@Example.com" };

describe("checkSignInAccess", () => {
  it("lets in an active user an administrator added", () => {
    expect(
      checkSignInAccess(authUser, {
        id: "user-1",
        email: "staff@example.com",
        isActive: true,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects an email nobody added", () => {
    expect(checkSignInAccess(authUser, null)).toEqual({
      ok: false,
      reason: "not_authorized",
    });
  });

  it("rejects a deactivated user", () => {
    expect(
      checkSignInAccess(authUser, {
        id: "user-1",
        email: "staff@example.com",
        isActive: false,
      }),
    ).toEqual({ ok: false, reason: "account_deactivated" });
  });

  it("rejects a login whose email doesn't match the added account", () => {
    expect(
      checkSignInAccess(authUser, {
        id: "user-1",
        email: "someone.else@example.com",
        isActive: true,
      }),
    ).toEqual({ ok: false, reason: "not_authorized" });
  });

  it("rejects a login tied to a different account", () => {
    expect(
      checkSignInAccess(authUser, {
        id: "user-2",
        email: "staff@example.com",
        isActive: true,
      }),
    ).toEqual({ ok: false, reason: "not_authorized" });
  });
});

describe("rejectionFromProviderError", () => {
  it("maps Supabase's sign-ups-disabled error to not_authorized", () => {
    expect(rejectionFromProviderError("Signups not allowed for this instance")).toBe(
      "not_authorized",
    );
  });

  it("maps a banned user to account_deactivated", () => {
    expect(rejectionFromProviderError("User is banned")).toBe(
      "account_deactivated",
    );
  });

  it("falls back to a generic failure", () => {
    expect(rejectionFromProviderError("something odd")).toBe("sign_in_failed");
    expect(rejectionFromProviderError(null)).toBe("sign_in_failed");
  });
});
