import { describe, expect, it } from "vitest";
import {
  courseGraceContentHash,
  currentCourseGraceState,
} from "@/lib/courses/grace-compliance";

describe("course GRACE fingerprints", () => {
  const input = {
    title: "Introduction to Computing",
    courseContent: "Students examine computing systems and their applications.",
    learningOutcomes: ["Explain a computing system"],
  };

  it("reuses a result for unchanged text with harmless whitespace differences", () => {
    expect(courseGraceContentHash(input)).toBe(
      courseGraceContentHash({
        title: "  Introduction   to Computing ",
        courseContent:
          " Students examine computing systems   and their applications. ",
        learningOutcomes: [" Explain a computing system "],
      }),
    );
  });

  it("invalidates compliance when the description or learning outcomes change", () => {
    expect(
      courseGraceContentHash({
        ...input,
        courseContent: `${input.courseContent} Students also build a prototype.`,
      }),
    ).not.toBe(courseGraceContentHash(input));
    expect(
      courseGraceContentHash({
        ...input,
        learningOutcomes: ["Design a computing system"],
      }),
    ).not.toBe(courseGraceContentHash(input));
  });
});

describe("course GRACE state as read", () => {
  const title = "Introduction to Computing";
  const courseContent = "Students examine computing systems and their applications.";
  const stored = {
    courseContent,
    learningOutcomes: [],
    graceContentHash: courseGraceContentHash({ title, courseContent, learningOutcomes: [] }),
    graceStatus: "COMPLIANT" as const,
    gracePass: true,
    graceResult: { passed: true },
    graceCheckedAt: new Date("2026-11-01T00:00:00Z"),
  };

  it("keeps a result that belongs to the current text", () => {
    expect(currentCourseGraceState(title, stored)).toBe(stored);
  });

  it("shows a result for older text as waiting, without changing the record", () => {
    const edited = { ...stored, courseContent: `${courseContent} Revised.` };
    expect(currentCourseGraceState(title, edited)).toMatchObject({
      courseContent: edited.courseContent,
      graceStatus: "PENDING",
      gracePass: false,
      graceResult: null,
      graceCheckedAt: null,
    });
    expect(edited.graceStatus).toBe("COMPLIANT");
    // A title change makes the result stale too.
    expect(currentCourseGraceState("Computing Today", stored).graceStatus).toBe("PENDING");
  });
});

