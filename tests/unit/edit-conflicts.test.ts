import { describe, expect, it } from "vitest";
import { changedSince, conflictSnapshot, conflictValue, editConflicts } from "@/lib/submissions/edit-conflicts";

// Task G3: when two people edit the same field, the second is warned.

describe("edit conflicts (G3)", () => {
  it("compares a field the same way whatever shape it comes in", () => {
    expect(conflictValue(["Teamwork ", "", "Writing"])).toBe("Teamwork\nWriting");
    expect(conflictValue("Teamwork; Writing")).toBe(conflictValue(["Teamwork", "Writing"]));
    expect(conflictValue({ content: "<p>Rules</p>" })).toBe("<p>Rules</p>");
    expect(conflictValue(2.5)).toBe("2.5");
    expect(conflictValue(null)).toBe("");
  });

  it("sends only the fields this page changed, with what it last saw", () => {
    const snapshot = conflictSnapshot({ mission: "Old mission", vision: "A vision", employability: "Teamwork; Writing" });
    expect(changedSince({ mission: "New mission", vision: "A vision", employability: ["Teamwork", "Writing"] }, snapshot)).toEqual({ mission: "Old mission" });
  });

  it("warns only when someone else moved the field on and this save would overwrite it", () => {
    const previous = { mission: "Old mission" };
    // Nobody else saved: no conflict.
    expect(editConflicts(previous, { mission: "Old mission" }, { mission: "Mine" })).toEqual([]);
    // Someone else saved a different mission: conflict.
    expect(editConflicts(previous, { mission: "Theirs" }, { mission: "Mine" })).toEqual(["mission"]);
    // Both wrote the same words: nothing to choose.
    expect(editConflicts(previous, { mission: "Same" }, { mission: "Same" })).toEqual([]);
    // Nothing sent to compare: never a conflict (older pages).
    expect(editConflicts(undefined, { mission: "Theirs" }, { mission: "Mine" })).toEqual([]);
  });
});
