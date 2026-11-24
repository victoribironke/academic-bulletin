import { describe, expect, it } from "vitest";
import { DEFAULT_WORKING_WEEK, addDays, type DateKey } from "@/lib/calendar/dates";
import type { DeadlineStatus } from "@/lib/calendar/countdown";
import { decideForDesk, maySendAt } from "@/lib/agent/rules";

// Task T3 against launch test 8 (section 13): the 2027-2031 calendar.
const calendar = {
  workingWeek: DEFAULT_WORKING_WEEK,
  holidays: ["2026-12-25", "2026-12-28", "2027-01-01"],
  breaks: [{ from: "2026-12-24", to: "2027-01-03" }],
};
const checkpoints = [
  { code: "CP1", name: "Course list and profile sections", dueDate: "2026-12-11" },
  { code: "CP2", name: "Lecturers assigned; admission and graduation", dueDate: "2026-12-18" },
  { code: "CP3", name: "Course structure; half of course details", dueDate: "2027-01-15" },
  { code: "CP4", name: "All course details", dueDate: "2027-01-29" },
  { code: "FINAL", name: "Submit to School", dueDate: "2027-02-04" },
];
const finalDate = "2027-02-04";

/** Every day the agent writes to a desk with this status, with the message history building up. */
function run(from: DateKey, to: DateKey, statusOn: (date: DateKey) => DeadlineStatus) {
  const history: { date: DateKey; status: DeadlineStatus }[] = [];
  const written: { date: DateKey; reasons: string[]; mentions: string[]; copySupervisor: boolean; copyLeadership: boolean }[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const status = statusOn(date);
    const decision = decideForDesk({ date, calendar, status, checkpoints, finalDate, history });
    if (decision.write) {
      written.push({ date, reasons: decision.reasons, mentions: decision.mentions, copySupervisor: decision.copySupervisor, copyLeadership: decision.copyLeadership });
      history.unshift({ date, status });
    }
  }
  return written;
}

describe("the reminder agent's rules (T3, T4; launch test 8)", () => {
  it("writes to an on-track Head exactly on test 8's dates, one message a day", () => {
    const written = run("2026-11-26", "2027-02-04", () => "ON_TRACK");
    const dates = written.map((item) => item.date);
    const mondays = ["2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21", "2027-01-04", "2027-01-11", "2027-01-18", "2027-01-25", "2027-02-01"];
    const extra = ["2026-12-04", "2026-12-09", "2026-12-11", "2026-12-16", "2027-01-08", "2027-01-13", "2027-01-14", "2027-01-21", "2027-01-22", "2027-01-27", "2027-01-28", "2027-02-03", "2027-02-04"];
    expect(dates).toEqual([...mondays, ...extra].sort());
    // Nothing from Thursday, December 24, 2026 to Sunday, January 3, 2027.
    expect(dates.some((date) => date >= "2026-12-24" && date <= "2027-01-03")).toBe(false);
    // December 11: CP1 due today and CP2 in 7 days, in one message.
    expect(written.find((item) => item.date === "2026-12-11")).toMatchObject({ reasons: ["CP2 in 7 days"], mentions: ["CP1 due today"] });
    expect(written.find((item) => item.date === "2027-02-01")?.reasons).toEqual(["final date in 3 days", "Monday summary"]);
    expect(written.find((item) => item.date === "2027-02-04")?.reasons).toEqual(["final date today"]);
    expect(written.every((item) => !item.copySupervisor && !item.copyLeadership)).toBe(true);
  });

  it("copies the Dean from the first overdue day and DAP leadership from the third", () => {
    const written = run("2027-02-05", "2027-02-09", () => "OVERDUE");
    expect(written.map((item) => [item.date, item.copySupervisor, item.copyLeadership])).toEqual([
      ["2027-02-05", true, false],
      ["2027-02-08", true, false],
      ["2027-02-09", true, true],
    ]);
  });

  it("writes every second working day when At risk, copying the supervisor from the third message", () => {
    const written = run("2027-01-04", "2027-01-15", () => "AT_RISK");
    // Friday 8, then Tuesday 12 (the second working day after); 13 and 14 are
    // CP3 in 2 days and the final date in 21 days, whatever the status.
    expect(written.map((item) => item.date)).toEqual(["2027-01-04", "2027-01-06", "2027-01-08", "2027-01-12", "2027-01-13", "2027-01-14"]);
    expect(written.map((item) => item.copySupervisor)).toEqual([false, false, true, true, true, true]);
  });

  it("writes Monday and Thursday when a desk needs watching", () => {
    expect(run("2027-01-04", "2027-01-10", () => "KEEP_AN_EYE").map((item) => item.date)).toEqual(["2027-01-04", "2027-01-07", "2027-01-08"]);
  });

  it("never sends in quiet hours, on the Sabbath or in the Christmas break (T6)", () => {
    const wat = (local: string) => new Date(`${local}+01:00`);
    expect(maySendAt(wat("2026-12-07T08:00:00")).ok).toBe(true);
    expect(maySendAt(wat("2026-12-07T07:59:00")).because).toBe("It is outside 8:00 am to 6:00 pm.");
    expect(maySendAt(wat("2026-12-07T18:00:00")).ok).toBe(false);
    expect(maySendAt(wat("2026-12-11T17:59:00")).ok).toBe(true);
    expect(maySendAt(wat("2026-12-11T18:30:00")).because).toBe("It is the Sabbath.");
    expect(maySendAt(wat("2026-12-12T12:00:00")).because).toBe("It is the Sabbath.");
    expect(maySendAt(wat("2026-12-28T09:00:00")).because).toMatch(/quiet period/);
    expect(maySendAt(wat("2027-01-04T08:00:00")).ok).toBe(true);
  });
});
