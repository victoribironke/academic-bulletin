import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePretendNow, pretendNowFromWat, PRETEND_NOW_COOKIE } from "@/lib/pretend-clock";

// Section 13: "a pretend clock, a test-only setting for today". Only the
// test site honours it; the live site always uses the real time.

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === PRETEND_NOW_COOKIE && cookieValue ? { value: cookieValue } : undefined) }),
}));

describe("pretend clock values", () => {
  it("reads a date and time typed in West Africa Time", () => {
    expect(pretendNowFromWat("2027-02-04T23:58")).toBe("2027-02-04T22:58:00.000Z");
    expect(pretendNowFromWat("2026-11-26T08:00")).toBe("2026-11-26T07:00:00.000Z");
  });

  it("refuses anything that isn't a sensible date in the cycle", () => {
    expect(pretendNowFromWat("tomorrow")).toBeNull();
    expect(pretendNowFromWat("2019-01-01T00:00")).toBeNull();
    expect(pretendNowFromWat("2040-01-01T00:00")).toBeNull();
    expect(parsePretendNow("not-a-date")).toBeNull();
    expect(parsePretendNow("%E0%A4%A")).toBeNull();
    expect(parsePretendNow(encodeURIComponent("2027-02-04T22:58:00.000Z"))?.toISOString()).toBe("2027-02-04T22:58:00.000Z");
  });
});

describe("calendarNow", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    cookieValue = undefined;
  });

  it("uses the pretend time on the test site", async () => {
    vi.stubEnv("APP_ENV", "staging");
    cookieValue = encodeURIComponent("2027-02-04T22:58:00.000Z");
    const { calendarNow } = await import("@/lib/clock");
    expect((await calendarNow()).toISOString()).toBe("2027-02-04T22:58:00.000Z");
  });

  it("ignores the cookie on the live site", async () => {
    vi.stubEnv("APP_ENV", "");
    cookieValue = encodeURIComponent("2027-02-04T22:58:00.000Z");
    const { calendarNow } = await import("@/lib/clock");
    expect(Math.abs((await calendarNow()).getTime() - Date.now())).toBeLessThan(5_000);
  });

  it("uses the real time on the test site when no pretend time is set", async () => {
    vi.stubEnv("APP_ENV", "staging");
    const { calendarNow } = await import("@/lib/clock");
    expect(Math.abs((await calendarNow()).getTime() - Date.now())).toBeLessThan(5_000);
  });
});
