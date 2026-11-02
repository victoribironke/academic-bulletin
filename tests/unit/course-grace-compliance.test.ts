import { describe, expect, it } from "vitest";
import { courseGraceContentHash } from "@/lib/courses/grace-compliance";

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
