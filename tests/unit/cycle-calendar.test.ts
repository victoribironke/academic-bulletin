import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CalendarSettings, checkCalendarSettings } from "@/lib/calendar/settings";
import { type CycleCalendar, deskCountdown, extensionFor, phaseList } from "@/lib/calendar/desk";

// Tasks C1 and C3 with the calendar of work order section 4.6.

const settings = JSON.parse(
  readFileSync(join(process.cwd(), "data/calendar/2027-2031.json"), "utf8"),
) as CalendarSettings;

const calendar: CycleCalendar = {
  cycleId: "c",
  cycleName: settings.cycle.name,
  dueTime: "23:59",
  calendar: {
    workingWeek: settings.cycle.workingWeek!,
    holidays: settings.cycle.holidays!.map((holiday) => holiday.date),
    breaks: settings.cycle.quietPeriods!.map((period) => ({ from: period.from, to: period.to })),
  },
  phases: settings.phases.map((phase) => ({
    phase: phase.no,
    name: phase.name,
    label: phase.label,
    desk: phase.desk,
    scope: phase.scope,
    opensAt: phase.opensAt ?? phase.baselineOpensAt ?? null,
    formalOpensAt: phase.formalOpensAt ?? null,
    dueAt: phase.dueAt ?? phase.baselineDueAt ?? null,
    hardStop: phase.hardStop ?? false,
  })),
  checkpoints: settings.checkpoints
    .map((checkpoint) => ({
      phase: checkpoint.phase,
      code: checkpoint.code,
      name: checkpoint.name,
      type: checkpoint.type ?? "CHECKPOINT",
      dueAt: checkpoint.dueAt,
      desks: checkpoint.desks ?? [],
    }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
  extensions: [{ scope: "DEPARTMENT", targetId: "dept-late", phase: 1, newDueAt: "2027-02-12" }],
};
const launch = new Date("2026-11-26T08:00:00+01:00");
const person = (role: "HOD" | "DEAN" | "ADMIN", departmentId: string | null = "dept-a") => ({
  id: `u-${role}`,
  role,
  departmentId,
  schoolId: "school-a",
  programmeIds: [],
});

describe("the section 4.6 calendar file (C1)", () => {
  it("loads with no problems: 10 phases, 17 checkpoints, 6 holidays", () => {
    expect(checkCalendarSettings(settings)).toEqual([]);
    expect(settings.phases).toHaveLength(10);
    expect(settings.checkpoints).toHaveLength(17);
    expect(settings.cycle.holidays).toHaveLength(6);
  });

  it("refuses a bad date, a repeated code and a phase due before it opens", () => {
    const bad: CalendarSettings = {
      ...settings,
      phases: [{ ...settings.phases[0], dueAt: "2026-11-01" }, ...settings.phases.slice(1)],
      checkpoints: [...settings.checkpoints, { ...settings.checkpoints[0], dueAt: "2026-02-30" }],
    };
    const problems = checkCalendarSettings(bad).join(" ");
    expect(problems).toMatch(/Phase 1 is due before it opens/);
    expect(problems).toMatch(/not a date: 2026-02-30/);
    expect(problems).toMatch(/checkpoint code is listed twice/);
  });
});

describe("whose deadline is whose (C3)", () => {
  it("gives a Head of Department Departmental Drafting and CP1 on launch day", () => {
    const countdown = deskCountdown(calendar, person("HOD"), launch)!;
    expect(countdown.label).toBe("Departmental Drafting");
    expect(countdown.headline).toBe("70 days left");
    expect(countdown.nextLine).toBe("Next: CP1 on Friday, December 11, 2026 (15 days)");
    expect(countdown.workingDaysLine).toBe("44 working days left");
  });

  it("names a milestone by its name, not its code", () => {
    const countdown = deskCountdown(calendar, person("HOD"), new Date("2026-12-12T10:00:00+01:00"))!;
    expect(countdown.nextLine).toBe("Next: Submissions open on Monday, December 14, 2026 (2 days)");
  });

  it("lets an extension for the department take precedence over the cycle date", () => {
    expect(extensionFor(calendar, 1, { departmentIds: ["dept-late"] })).toBe("2027-02-12");
    const extended = deskCountdown(calendar, person("HOD", "dept-late"), launch)!;
    expect(extended.extendedLine).toBe("Extended to Friday, February 12, 2027");
    expect(extended.headline).toBe("78 days left");
    expect(deskCountdown(calendar, person("HOD", "dept-a"), launch)!.extendedLine).toBeNull();
  });

  it("gives a Dean School Board Harmonisation and the Dean's checkpoints", () => {
    const countdown = deskCountdown(calendar, person("DEAN"), new Date("2027-02-05T09:00:00+01:00"))!;
    expect(countdown.label).toBe("School Board Harmonisation");
    expect(countdown.dueLine).toBe("Due Thursday, February 25, 2027, 11:59 pm");
    expect(countdown.nextLine).toBe("Next: DCP1 on Friday, February 12, 2027 (7 days)");
  });

  it("gives Academic Planning the next phase to close and all ten phases", () => {
    expect(deskCountdown(calendar, person("ADMIN", null), launch)!.label).toBe("Departmental Drafting");
    const phases = phaseList(calendar, launch);
    expect(phases).toHaveLength(10);
    expect(phases[0]).toMatchObject({ name: "Departmental Drafting", due: "Thursday, February 4, 2027", daysLeft: 70 });
    expect(phases[8]).toMatchObject({ due: "Wednesday, June 30, 2027", hardStop: true });
  });
});
