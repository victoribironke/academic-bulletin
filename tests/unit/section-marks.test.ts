import { describe, expect, it } from "vitest";
import { calculateSubmissionProgress } from "@/lib/submissions/progress";
import { sectionMarks } from "@/lib/submissions/section-status";

// Task G4: a tick when complete and correct, an amber dot when something
// needs checking, a red number for things to fix plus open comments.
describe("section marks (G4)", () => {
  const fresh = calculateSubmissionProgress({ content: null, activeStaffCount: 0, courses: [] });

  it("shows nothing on a section nobody has started, even though it is empty", () => {
    const marks = sectionMarks(fresh, [{ code: "NO_STAFF", message: "Add staff." }, { code: "MISSING_MINIMUM_CGPA", message: "Enter the minimum CGPA." }], {});
    expect(marks.staff).toMatchObject({ state: "none" });
    expect(marks.graduation).toMatchObject({ state: "none" });
  });

  it("counts real problems and open comments in red", () => {
    const marks = sectionMarks(
      fresh,
      [{ code: "PHILOSOPHY_LENGTH", message: "The programme philosophy has 90 words; it must have 150 to 250." }],
      { overview: 2, admission: 1 },
    );
    expect(marks.overview).toMatchObject({ state: "fix", count: 3 });
    expect(marks.overview.label).toContain("90 words");
    expect(marks.overview.label).toContain("2 open comments");
    expect(marks.admission).toMatchObject({ state: "fix", count: 1 });
  });

  it("ticks a complete section, and puts an amber dot on one started or waiting for confirmation", () => {
    const progress = calculateSubmissionProgress({
      content: { mission: "A clear mission.", graduationRequirements: "x", minimumCGPA: 2, totalUnits: 150 },
      activeStaffCount: 3,
      courses: [{ description: { courseContent: "Content", learningOutcomes: ["Explain"] } }],
    });
    const marks = sectionMarks(progress, [], {});
    expect(marks.staff).toMatchObject({ state: "done", label: "Complete" });
    expect(marks.overview).toMatchObject({ state: "check" });
    expect(marks.courses).toMatchObject({ state: "check", label: "Needs checking: confirm the list" });
    expect(marks.graduation).toMatchObject({ state: "done" });
  });
});
