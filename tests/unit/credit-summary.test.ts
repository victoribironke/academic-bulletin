import { describe, expect, it } from "vitest";
import { creditSummary, graduationNumbersText, hoursHint, unitsFromHours } from "@/lib/courses/credit-summary";
import { courseHeading } from "@/lib/bulletin/course-layout";

// Tasks W2 to W5: the credit arithmetic the app does itself.

const course = (level: number, units: number, kind: "ge" | "own" | "outside", extra: object = {}) => ({
  level,
  units,
  generalEducation: kind === "ge",
  owned: kind !== "outside",
  ...extra,
});

describe("the credit summary (W4)", () => {
  it("builds Economics' 39 + 111 + 4 = 154 from the course structure", () => {
    const courses = [
      ...Array.from({ length: 13 }, () => course(100, 3, "ge")),
      ...Array.from({ length: 37 }, (_, index) => course(100 + (index % 4) * 100, 3, "own")),
      course(200, 4, "outside"),
    ];
    const { totals, rows } = creditSummary(courses);
    expect(totals).toEqual({ generalEducation: 39, departmental: 111, outside: 4, total: 154 });
    expect(rows.map((row) => row.level)).toEqual([100, 200, 300, 400]);
    expect(rows[1]).toMatchObject({ level: 200, outside: 4 });
    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(154);
  });

  it("counts an elective group as the units a student chooses, never more than it offers (W3)", () => {
    const grouped = [course(300, 3, "own"), course(300, 3, "own", { electiveGroupId: "g" }), course(300, 3, "own", { electiveGroupId: "g" }), course(400, 3, "own", { electiveGroupId: "g" })];
    expect(creditSummary(grouped, [{ id: "g", name: "Options", chooseUnits: 6 }]).totals.total).toBe(9);
    // The group sits at its lowest level.
    expect(creditSummary(grouped, [{ id: "g", name: "Options", chooseUnits: 6 }]).rows).toEqual([
      { level: 300, generalEducation: 0, departmental: 9, outside: 0, total: 9 },
    ]);
    expect(creditSummary(grouped, [{ id: "g", name: "Options", chooseUnits: 20 }]).totals.total).toBe(12);
    // A course pointing at a group that no longer exists counts in full.
    expect(creditSummary(grouped).totals.total).toBe(12);
  });

  it("writes the graduation numbers in words (W5)", () => {
    expect(graduationNumbersText({ generalEducation: 39, departmental: 111, outside: 4, total: 154 })).toBe(
      "To graduate, a student must earn at least 154 credits: 111 in the department's own courses, 4 in courses from other departments, and 39 in General Education.",
    );
  });
});

describe("contact hours and the description heading (W2, W15)", () => {
  it("works out units from hours, and says what a unit usually means", () => {
    expect(unitsFromHours(45, 0)).toBe(3);
    expect(unitsFromHours(30, 45)).toBe(3);
    expect(unitsFromHours(null, undefined)).toBeNull();
    expect(hoursHint(2)).toBe("2 units usually means 30 lecture hours (or 45 practical hours for each unit).");
  });

  it("lays out the heading line as the bulletin prints it", () => {
    expect(courseHeading({ code: "ECO 101", title: "Principles of Economics I", units: 2, status: "CORE", lectureHours: 30, practicalHours: 0 })).toBe(
      "ECO 101: Principles of Economics I (2 units, Core; 30 lecture hours, 0 practical hours)",
    );
    expect(courseHeading({ code: "ECO 499", title: "Research Project", units: 1, status: "ELECTIVE" })).toBe("ECO 499: Research Project (1 unit, Elective)");
  });
});
