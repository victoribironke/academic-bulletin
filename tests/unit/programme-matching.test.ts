import { describe, expect, it } from "vitest";
import {
  matchProgrammeNames,
  normaliseProgrammeName,
} from "@/lib/courses/programme-matching";

describe("CCMAS programme matching", () => {
  it("normalises degree prefixes, punctuation, and ampersands", () => {
    expect(
      normaliseProgrammeName(
        "B.Sc. Information & Communication Technology",
      ),
    ).toBe("information and communication technology");
  });

  it("matches only an unambiguous programme name", () => {
    const result = matchProgrammeNames(
      ["B.Sc. Computer Science", "Unknown Studies"],
      [{ id: "cs", name: "Computer Science", degreeType: "BSc" }],
    );

    expect(result.matchedIds).toEqual(["cs"]);
    expect(result.unmatchedNames).toEqual(["Unknown Studies"]);
    expect(result.ambiguousNames).toEqual([]);
  });

  it("does not guess when two local programmes have the same name", () => {
    const result = matchProgrammeNames(
      ["Economics"],
      [
        { id: "one", name: "Economics" },
        { id: "two", name: "Economics" },
      ],
    );

    expect(result.matchedIds).toEqual([]);
    expect(result.ambiguousNames).toEqual(["Economics"]);
  });
});
