import { describe, expect, it } from "vitest";
import {
  countWords,
  GraceServiceError,
  parseGraceAnalysis,
  runGraceCheck,
} from "@/lib/grace";

const complete = {
  G_Global_Relevance: { score: 3, summary: "Global standards are explicit." },
  R_Research_Focus: { score: 3, summary: "Research is explicit." },
  A_Adventist_Rooted: { score: 3, summary: "Service and faith are explicit." },
  C_Competent_Community: { score: 3, summary: "Community impact is explicit." },
  E_Entrepreneurship: { score: 3, summary: "Innovation is explicit." },
  Vision_Alignment_Summary: "Meets the stated standard.",
};

describe("GRACE validation", () => {
  it("requires all five pillar scores before a result can pass", () => {
    const incomplete = { ...complete } as Record<string, unknown>;
    delete incomplete.E_Entrepreneurship;
    expect(() => parseGraceAnalysis(incomplete)).toThrow(GraceServiceError);
  });

  it("passes only a complete result whose five scores meet the threshold", () => {
    expect(parseGraceAnalysis(complete).passed).toBe(true);
    expect(
      parseGraceAnalysis({
        ...complete,
        R_Research_Focus: { score: 2, summary: "Research is too weak." },
      }).passed,
    ).toBe(false);
  });

  it("enforces the 150-word minimum before calling the AI service", async () => {
    const content = Array.from({ length: 149 }, () => "word").join(" ");
    expect(countWords(content)).toBe(149);
    const result = await runGraceCheck("Test", content);
    expect(result.passed).toBe(false);
    expect(result.wordCount).toBe(149);
    expect(result.explanation).toContain("At least 150 words");
  });
});
