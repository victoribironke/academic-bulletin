import { describe, expect, it } from "vitest";
import { FIELD_HELP, fieldExample, lengthLine, lengthStatus, measure, wordCount } from "@/lib/help/field-help";

// Task H4: help under each field, with a live length counter.

describe("field help (H4)", () => {
  it("has a line and a target for every field", () => {
    for (const [field, help] of Object.entries(FIELD_HELP)) {
      expect(help.good.length, field).toBeGreaterThan(10);
      expect(help.target.min, field).toBeLessThan(help.target.max);
    }
    expect(FIELD_HELP.philosophy.target).toEqual({ unit: "words", min: 150, max: 250 });
    expect(FIELD_HELP.learningOutcomes.target.min).toBe(3);
  });

  it("counts words in plain and rich text, and items in lists", () => {
    expect(wordCount("  To be a leading   programme ")).toBe(5);
    expect(wordCount("<p>Assessment&nbsp;rules</p><ul><li>Probation</li></ul>")).toBe(3);
    expect(measure(["Explain the ideas", "", "Apply the methods"], "items")).toBe(2);
    expect(measure("Explain\n\nApply\nCompare", "items")).toBe(3);
    expect(measure(["Two words", "three more words"], "words")).toBe(5);
    expect(measure(null, "words")).toBe(0);
  });

  it("says how the length compares with the target", () => {
    const target = { unit: "words" as const, min: 15, max: 40 };
    expect(lengthStatus(0, target)).toBe("empty");
    expect(lengthStatus(10, target)).toBe("short");
    expect(lengthStatus(20, target)).toBe("good");
    expect(lengthStatus(41, target)).toBe("long");
    expect(lengthLine(1, target)).toBe("1 word · aim for 15 to 40");
    expect(lengthLine(3, { unit: "items", min: 3, max: 8 })).toBe("3 items · aim for 3 to 8");
  });

  it("shows an example only once DAP has chosen one", () => {
    expect(fieldExample("vision")).toBeNull();
  });
});
