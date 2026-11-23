import { describe, expect, it } from "vitest";
import { buildCountdown } from "@/lib/calendar/countdown";
import {
  type WorkingCalendar,
  dateKeyAt,
  deadlineInstant,
  formatLongDate,
  isWorkingDay,
  workingDaysBetween,
} from "@/lib/calendar/dates";

// Task C2, with the calendar of section 4.6. These run with the server in
// UTC or any other zone: every date is worked out in West Africa Time.

const calendar: WorkingCalendar = {
  workingWeek: ["MON", "TUE", "WED", "THU", "FRI"],
  holidays: ["2026-12-25", "2027-01-01", "2027-03-10", "2027-03-26", "2027-03-29", "2027-05-17"],
  // The university break, Thursday, December 24, 2026 to Friday, January 1, 2027 (section 4.5).
  breaks: [{ from: "2026-12-24", to: "2027-01-01" }],
};
const departmental = (now: string, extendedTo?: string) =>
  buildCountdown({
    label: "Departmental Drafting",
    dueDate: "2027-02-04",
    extendedTo: extendedTo ?? null,
    nextCheckpoint: { code: "CP1", name: "Course list and profile sections", dueDate: "2026-12-11" },
    calendar,
    now: new Date(now),
  });

describe("WAT dates", () => {
  it("uses West Africa Time for 'today', whatever the server's zone", () => {
    expect(dateKeyAt(new Date("2026-11-25T22:59:59Z"))).toBe("2026-11-25"); // 11:59 pm WAT
    expect(dateKeyAt(new Date("2026-11-25T23:00:00Z"))).toBe("2026-11-26"); // midnight WAT
    expect(deadlineInstant("2027-02-04").toISOString()).toBe("2027-02-04T22:59:59.999Z");
    expect(formatLongDate("2027-02-04")).toBe("Thursday, February 4, 2027");
  });

  it("skips weekends, holidays and the Christmas break", () => {
    expect(isWorkingDay("2026-12-23", calendar)).toBe(true);
    expect(isWorkingDay("2026-12-28", calendar)).toBe(false); // break
    expect(isWorkingDay("2027-01-04", calendar)).toBe(true);
    expect(isWorkingDay("2027-03-26", calendar)).toBe(false); // Good Friday
    expect(isWorkingDay("2026-11-28", calendar)).toBe(false); // Saturday
    expect(workingDaysBetween("2026-11-26", "2027-02-04", calendar)).toBe(44);
  });
});

describe("the countdown (C2)", () => {
  it("reads as the work order's example on November 26, 2026", () => {
    const countdown = departmental("2026-11-26T09:00:00+01:00");
    expect(countdown.headline).toBe("70 days left");
    expect(countdown.dueLine).toBe("Due Thursday, February 4, 2027, 11:59 pm");
    expect(countdown.nextLine).toBe("Next: CP1 on Friday, December 11, 2026 (15 days)");
    expect(countdown.workingDaysLine).toBe("44 working days left");
    expect(countdown.statusLabel).toBe("On track");
  });

  it("turns over at midnight WAT, not midnight UTC", () => {
    // 11:58 pm and 11:59 pm WAT on February 3: one day left.
    expect(departmental("2027-02-03T22:58:00Z").headline).toBe("1 day left");
    expect(departmental("2027-02-03T22:59:30Z").headline).toBe("1 day left");
    // 12:00 am WAT on February 4 (still February 3 in UTC): due today.
    expect(departmental("2027-02-03T23:00:00Z").headline).toBe("Due today at 11:59 pm");
  });

  it("is due today until 11:59 pm and overdue from 12:00 am", () => {
    expect(departmental("2027-02-04T22:58:00Z").headline).toBe("Due today at 11:59 pm"); // 11:58 pm WAT
    expect(departmental("2027-02-04T22:59:59Z").state).toBe("due-today"); // 11:59 pm WAT
    const late = departmental("2027-02-04T23:00:00Z"); // 12:00 am WAT, February 5
    expect(late.headline).toBe("Overdue by 1 day");
    expect(late.statusLabel).toBe("Overdue");
    expect(departmental("2027-02-06T12:00:00+01:00").headline).toBe("Overdue by 2 days");
  });

  it("keeps running through the Christmas break, with no working days counted in it", () => {
    const christmas = departmental("2026-12-28T10:00:00+01:00");
    expect(christmas.headline).toBe("38 days left");
    expect(christmas.workingDaysLeft).toBe(workingDaysBetween("2027-01-04", "2027-02-04", calendar));
  });

  it("uses an extension in place of the cycle date, and says so", () => {
    const extended = departmental("2027-02-05T10:00:00+01:00", "2027-02-12");
    expect(extended.headline).toBe("7 days left");
    expect(extended.dueLine).toBe("Due Friday, February 12, 2027, 11:59 pm");
    expect(extended.extendedLine).toBe("Extended to Friday, February 12, 2027");
  });

  it("asks for attention in the last 5 working days", () => {
    expect(departmental("2027-01-29T10:00:00+01:00").statusLabel).toBe("Keep an eye on it");
  });
});
