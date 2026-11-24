import { describe, expect, it } from "vitest";
import { DEFAULT_WORKING_WEEK } from "@/lib/calendar/dates";
import { checkpointMet, deskStatus, type DeskStatusInput } from "@/lib/desk/status";
import { headDeskStatus } from "@/lib/desk/programme-status";

// Task T2 (section 7.2): a Head of Department's desk in Departmental
// Drafting, opened Thursday, November 26, 2026, due Thursday, February 4, 2027,
// with the Christmas break from December 24 to January 3.
const calendar = {
  workingWeek: DEFAULT_WORKING_WEEK,
  holidays: ["2026-12-25", "2026-12-28", "2027-01-01"],
  breaks: [{ from: "2026-12-24", to: "2027-01-03" }],
};
const wat = (local: string) => new Date(`${local}+01:00`);
const desk = (overrides: Partial<DeskStatusInput>): DeskStatusInput => ({
  now: wat("2026-12-14T09:00:00"),
  calendar,
  openedOn: "2026-11-26",
  dueDate: "2027-02-04",
  doneShare: 0.5,
  finished: false,
  lastActivityAt: wat("2026-12-11T15:00:00"),
  lastSignInAt: wat("2026-12-11T15:00:00"),
  missedCheckpoint: null,
  ...overrides,
});

describe("desk status (T2)", () => {
  it("is On track before the work opens, and in the first days whatever the pace", () => {
    expect(deskStatus(desk({ now: wat("2026-11-25T09:00:00"), doneShare: 0 })).reason).toBe(
      "On track: the work opens on Thursday, November 26, 2026.",
    );
    expect(deskStatus(desk({ now: wat("2026-11-27T09:00:00"), doneShare: 0.02, lastActivityAt: null, lastSignInAt: wat("2026-11-26T09:00:00") })).status).toBe("ON_TRACK");
  });

  it("is On track at a pace that finishes well before the deadline", () => {
    const status = deskStatus(desk({}));
    expect(status.status).toBe("ON_TRACK");
    expect(status.reason).toMatch(/^On track: at the current pace it finishes \d+ working days early \(50% left\)\.$/);
  });

  it("is At risk when a checkpoint was missed, with the reason in words", () => {
    expect(deskStatus(desk({ missedCheckpoint: { code: "CP1", dueDate: "2026-12-11" } })).reason).toBe(
      "At risk: CP1 was missed on Friday, December 11, 2026.",
    );
  });

  it("is At risk when the pace would miss the deadline, or nobody has signed in for 7 days", () => {
    expect(deskStatus(desk({ doneShare: 0.1 })).reason).toMatch(/^At risk: at the current pace it would finish after Thursday, February 4, 2027/);
    expect(deskStatus(desk({ doneShare: 0 })).reason).toMatch(/^At risk: no progress since the work opened/);
    expect(deskStatus(desk({ lastSignInAt: wat("2026-12-06T09:00:00") })).reason).toBe("At risk: nobody has signed in for 8 days.");
  });

  it("is At risk within 5 working days of the deadline with more than 20% left", () => {
    const status = deskStatus(desk({ now: wat("2027-02-01T09:00:00"), doneShare: 0.95, lastActivityAt: wat("2027-01-29T12:00:00"), lastSignInAt: wat("2027-01-29T12:00:00") }));
    // 5% left: the pace finishes only 1 working day early, so keep an eye on it.
    expect(status.reason).toBe("Keep an eye on it: at the current pace it would finish only 1 working day before the deadline.");
    expect(deskStatus(desk({ now: wat("2027-02-01T09:00:00"), doneShare: 0.75, lastActivityAt: wat("2027-01-29T12:00:00"), lastSignInAt: wat("2027-01-29T12:00:00") })).status).toBe("AT_RISK");
  });

  it("is Keep an eye on it after 5 quiet working days, not counting the Christmas break", () => {
    expect(deskStatus(desk({ lastActivityAt: wat("2026-12-04T12:00:00") })).reason).toBe(
      "Keep an eye on it: nothing has happened for 6 working days.",
    );
    // Quiet over the whole break: Wednesday 23 to Monday 4 is one working day.
    expect(
      deskStatus(desk({ now: wat("2027-01-04T09:00:00"), doneShare: 0.7, lastActivityAt: wat("2026-12-23T12:00:00"), lastSignInAt: wat("2027-01-04T08:00:00") })).status,
    ).toBe("ON_TRACK");
  });

  it("is Overdue after the deadline, unless nothing is left to do", () => {
    expect(deskStatus(desk({ now: wat("2027-02-05T00:00:00") })).reason).toBe("Overdue: the deadline was Thursday, February 4, 2027.");
    expect(deskStatus(desk({ now: wat("2027-02-04T23:58:00") })).status).not.toBe("OVERDUE");
    expect(deskStatus(desk({ now: wat("2027-02-05T00:00:00"), finished: true })).reason).toBe("On track: nothing left to do.");
    // An extension moves the deadline.
    expect(deskStatus(desk({ now: wat("2027-02-05T09:00:00"), dueDate: "2027-02-11", doneShare: 0.97, lastActivityAt: wat("2027-02-04T12:00:00"), lastSignInAt: wat("2027-02-04T12:00:00") })).status).toBe("ON_TRACK");
  });

  it("names the programme when a Head's desk has several", () => {
    const onTrack = deskStatus(desk({}));
    const atRisk = deskStatus(desk({ missedCheckpoint: { code: "CP1", dueDate: "2026-12-11" } }));
    expect(headDeskStatus([{ programme: "Economics", status: onTrack }, { programme: "Accounting", status: atRisk }])?.reason).toBe(
      "At risk: Accounting: CP1 was missed on Friday, December 11, 2026.",
    );
    expect(headDeskStatus([{ programme: "Economics", status: atRisk }])?.reason).toBe(atRisk.reason);
  });
});

describe("checkpoints (section 4.2)", () => {
  const facts = (overrides: Partial<Parameters<typeof checkpointMet>[1]> = {}) => ({
    sectionComplete: (number: number) => number <= 3,
    descriptionsShare: 0.4,
    courseListConfirmed: true,
    submitted: false,
    graceRunOnAll: false,
    ...overrides,
  });
  const cp1 = { sections: [1, 2, 3], requires: ["COURSE_LIST_CONFIRMED"] };
  const cp3 = { sections: [6, 7], requires: ["V1", "COURSE_DETAILS_50_PERCENT"] };

  it("needs CP1's sections and a confirmed course list", () => {
    expect(checkpointMet(cp1, facts())).toBe(true);
    expect(checkpointMet(cp1, facts({ courseListConfirmed: false }))).toBe(false);
    expect(checkpointMet(cp1, facts({ sectionComplete: (number) => number !== 2 }))).toBe(false);
  });

  it("needs half the course details at CP3, and ignores checks from later releases", () => {
    expect(checkpointMet(cp3, facts({ sectionComplete: () => true, descriptionsShare: 0.4 }))).toBe(false);
    expect(checkpointMet(cp3, facts({ sectionComplete: (number) => number === 6, descriptionsShare: 0.5 }))).toBe(true);
  });
});
