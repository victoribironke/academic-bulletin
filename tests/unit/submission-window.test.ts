import { describe, expect, it } from "vitest";
import {
  formatOpeningDate,
  parseSubmissionsOpenAt,
  submissionWindow,
  submissionsClosedMessage,
} from "@/lib/submissions/submission-window";

// Task F0: "Submit to School" stays off until Monday, December 14, 2026.
// Midnight in West Africa Time is 11:00 pm UTC the evening before.
const OPENS = new Date("2026-12-14T00:00:00+01:00");

describe("submission window (F0)", () => {
  it("uses DAP's wording with the date in West Africa Time", () => {
    expect(formatOpeningDate(OPENS)).toBe("Monday, December 14, 2026");
    expect(submissionsClosedMessage(OPENS)).toBe(
      "Submissions open on Monday, December 14, 2026. Keep working; your draft saves as you go.",
    );
  });

  it("stays closed until midnight WAT and opens on the dot, with the server in UTC", () => {
    expect(submissionWindow(OPENS, 1, new Date("2026-12-13T22:59:59Z"))).toMatchObject({ open: false });
    expect(submissionWindow(OPENS, 1, new Date("2026-12-13T23:00:00Z"))).toEqual({ open: true });
    expect(submissionWindow(OPENS, 1, new Date("2026-11-26T08:00:00+01:00"))).toEqual({
      open: false,
      opensAt: OPENS.toISOString(),
      message: submissionsClosedMessage(OPENS),
    });
  });

  it("only holds back the first Submit, and only when the cycle has a date", () => {
    const early = new Date("2026-11-30T10:00:00Z");
    expect(submissionWindow(OPENS, 4, early)).toEqual({ open: true }); // Departmental Revision
    expect(submissionWindow(null, 1, early)).toEqual({ open: true });
    expect(submissionWindow(undefined, 1, early)).toEqual({ open: true });
  });

  it("reads the date an admin sends, or null to remove it", () => {
    expect(parseSubmissionsOpenAt(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseSubmissionsOpenAt(null)).toEqual({ ok: true, value: null });
    expect(parseSubmissionsOpenAt("2026-12-14T00:00:00+01:00")).toEqual({ ok: true, value: OPENS });
    expect(parseSubmissionsOpenAt("next week")).toMatchObject({ ok: false });
    expect(parseSubmissionsOpenAt(20261214)).toMatchObject({ ok: false });
  });
});
