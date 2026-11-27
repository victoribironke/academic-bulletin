import { describe, expect, it } from "vitest";
import { calculateSubmissionProgress } from "@/lib/submissions/progress";
import { sectionMarks } from "@/lib/submissions/section-status";

// Task G4: a tick when complete and correct, an amber dot when something
// needs checking, a red number for things to fix plus open comments.
describe("section marks (G4)", () => {
  const fresh = calculateSubmissionProgress({ content: null, activeStaffCount: 0, courses: [] });

  it("shows nothing on a section nobody has started, even though it is empty", () => {
    const marks = sectionMarks(
      fresh,
      [
        { rule: "V19", level: "MUST", section: "staff", key: "V19", message: "Add staff." },
        { rule: "V26", level: "MUST", section: "graduation", key: "V26", message: "Enter the minimum CGPA to graduate." },
      ],
      {},
    );
    expect(marks.staff).toMatchObject({ state: "none" });
    expect(marks.graduation).toMatchObject({ state: "none" });
  });

  it("counts real problems and open comments in red", () => {
    const marks = sectionMarks(
      fresh,
      [{ rule: "Required", level: "MUST", section: "overview", key: "PHILOSOPHY_LENGTH", message: "The programme philosophy has 90 words; it must have 150 to 250." }],
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

  it("puts an amber dot for a Please check until it is accepted, and never counts a comment twice", () => {
    const progress = calculateSubmissionProgress({ content: null, activeStaffCount: 3, courses: [{ description: { courseContent: "Content", learningOutcomes: ["Explain"] } }] });
    const load = { rule: "V3", level: "CHECK" as const, section: "staff", key: "V3:100:1", message: "100 level carries 12 units." };
    expect(sectionMarks(progress, [load], {}).staff).toMatchObject({ state: "check", label: "Please check: 100 level carries 12 units." });
    expect(sectionMarks(progress, [{ ...load, accepted: { reason: "Approved" } }], {}).staff).toMatchObject({ state: "done" });
    const comment = { rule: "V13", level: "MUST" as const, section: "staff", key: "V13:staff", message: "1 open comment" };
    expect(sectionMarks(progress, [comment], { staff: 1 }).staff).toMatchObject({ state: "fix", count: 1 });
  });
});
