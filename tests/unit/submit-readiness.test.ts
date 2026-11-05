import { describe, expect, it } from "vitest";
import type { BulletinProgramme } from "@/lib/bulletin/generation";
import {
  countWords,
  philosophyGraceHash,
  philosophyGraceIsCurrent,
  submitReadinessIssues,
  type SubmitReadinessContent,
} from "@/lib/submissions/submit-readiness";

const philosophy = Array.from({ length: 160 }, (_, index) => `word${index + 1}`).join(" ");

function completeProgramme(): BulletinProgramme {
  return {
    id: "nursing",
    name: "Nursing Science",
    code: "NSC",
    department: "Department of Nursing",
    departmentCode: "NSG",
    school: "School of Nursing",
    schoolCode: "SON",
    staff: [
      {
        id: "staff-1",
        fullName: "Dr Ada Example",
        title: "Dr.",
        rank: "Senior Lecturer",
        qualification: "Ph.D.",
        type: "ACADEMIC",
      },
    ],
    courses: [
      {
        code: "NSC 101",
        title: "Foundations of Nursing",
        units: 3,
        status: "CORE",
        semester: 1,
        level: 100,
        description: {
          courseContent: "Principles of nursing practice.",
          learningOutcomes: ["Describe the nursing process"],
        },
      },
      {
        code: "NSC 102",
        title: "Anatomy for Nurses",
        units: 5,
        status: "CORE",
        semester: 2,
        level: 100,
        description: {
          courseContent: "The structure of the human body.",
          learningOutcomes: ["Name the major organ systems"],
        },
      },
    ],
    content: {
      philosophy,
      mission: "To train nurses.",
      vision: "Excellent care.",
      utmeRequirements: "Five credits.",
      graduationRequirements: "Complete all courses.",
      minimumDuration: "5 years",
      minimumCGPA: 2.5,
      totalUnits: 8,
    },
  };
}

function completeContent(): NonNullable<SubmitReadinessContent> {
  return {
    philosophy,
    philosophyGracePass: true,
    philosophyGrace: { passed: true, contentHash: philosophyGraceHash(philosophy) },
    minimumDuration: "5 years",
    minimumCGPA: 2.5,
    totalUnits: 8,
  };
}

const codes = (programme: BulletinProgramme, content: SubmitReadinessContent) =>
  submitReadinessIssues(programme, content).map((item) => item.code);

describe("submit readiness", () => {
  it("lets a complete draft submit", () => {
    expect(submitReadinessIssues(completeProgramme(), completeContent())).toEqual([]);
  });

  it("refuses declared units that differ from the course structure", () => {
    const programme = completeProgramme();
    programme.content!.totalUnits = 203;
    const issues = submitReadinessIssues(programme, { ...completeContent(), totalUnits: 203 });
    expect(issues).toContainEqual({
      code: "UNIT_TOTAL_MISMATCH",
      message:
        "The course structure contains 8 units, but the programme states 203 expected units.",
    });
  });

  it("refuses a missing total, duration or CGPA", () => {
    expect(
      codes(completeProgramme(), {
        ...completeContent(),
        totalUnits: null,
        minimumDuration: " ",
        minimumCGPA: null,
      }),
    ).toEqual(["MISSING_MINIMUM_DURATION", "MISSING_MINIMUM_CGPA", "MISSING_TOTAL_UNITS"]);
  });

  it.each([0, 0.99, 5.01, 7, Number.NaN])("refuses a minimum CGPA of %s", (cgpa) => {
    expect(codes(completeProgramme(), { ...completeContent(), minimumCGPA: cgpa })).toEqual([
      "CGPA_OUT_OF_RANGE",
    ]);
  });

  it.each([1, 2.5, 5])("accepts a minimum CGPA of %s", (cgpa) => {
    expect(codes(completeProgramme(), { ...completeContent(), minimumCGPA: cgpa })).toEqual([]);
  });

  it("refuses a philosophy outside 150 to 250 words", () => {
    for (const length of [149, 251]) {
      const text = Array.from({ length }, (_, index) => `w${index}`).join(" ");
      const programme = completeProgramme();
      programme.content!.philosophy = text;
      const issues = submitReadinessIssues(programme, {
        ...completeContent(),
        philosophy: text,
        philosophyGrace: { passed: true, contentHash: philosophyGraceHash(text) },
      });
      expect(issues).toEqual([
        {
          code: "PHILOSOPHY_LENGTH",
          message: `The programme philosophy has ${length} words; it must have 150 to 250.`,
        },
      ]);
    }
  });

  it("refuses empty required sections, no courses and no staff", () => {
    const programme = completeProgramme();
    programme.courses = [];
    programme.staff = [];
    programme.content!.mission = "<p> </p>";
    expect(codes(programme, { ...completeContent(), totalUnits: 8 })).toEqual(
      expect.arrayContaining(["NO_STAFF", "NO_COURSES", "MISSING_MISSION"]),
    );
  });

  it("only counts a GRACE pass produced for the philosophy as saved", () => {
    const content = completeContent();
    expect(philosophyGraceIsCurrent(content)).toBe(true);

    // Edited after the check: the old pass no longer counts.
    const edited = `${philosophy} more`;
    expect(philosophyGraceIsCurrent({ ...content, philosophy: edited })).toBe(false);

    // A pass with no fingerprint, or a failed check, never counts.
    expect(philosophyGraceIsCurrent({ ...content, philosophyGrace: { passed: true } })).toBe(false);
    expect(philosophyGraceIsCurrent({ ...content, philosophyGracePass: false })).toBe(false);

    expect(codes(completeProgramme(), { ...content, philosophyGrace: { passed: true } })).toEqual([
      "PHILOSOPHY_GRACE_REQUIRED",
    ]);
  });

  it("fingerprints the words, not the editor markup", () => {
    expect(philosophyGraceHash("<p>Faith  and\n learning</p>")).toBe(
      philosophyGraceHash("Faith and learning"),
    );
    expect(philosophyGraceHash("<p> </p>")).toBeNull();
    expect(countWords("<p>One two</p><p>three</p>")).toBe(3);
  });
});
