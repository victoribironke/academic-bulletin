import { describe, expect, it } from "vitest";
import { alternativesOf, compactCode, courseCodeOf, foldText, tsQueryOf, unitCodeFor } from "@/lib/search/normalise";

// Task K3: forgiving course codes, old unit codes and synonyms.
describe("search matching (K3)", () => {
  it("reads any spacing of a course code as the same code", () => {
    for (const typed of ["eco101", "ECO-101", "eco 101", " Eco  101 "]) expect(courseCodeOf(typed)).toBe("ECO101");
    expect(courseCodeOf("bu eco 125")).toBe("BUECO125");
    expect(courseCodeOf("BU-ECO125")).toBe("BUECO125");
    expect(courseCodeOf("economics")).toBeNull();
    expect(compactCode("BU-ECO 125")).toBe("BUECO125");
  });

  it("finds a renamed unit by its old code", () => {
    expect(unitCodeFor("SEH")).toBe("JSEH");
    expect(unitCodeFor("vass")).toBe("VSSS");
    expect(unitCodeFor("SAHS-HND")).toBe("SAHSNUT");
    expect(unitCodeFor("ZOLD", { ZOLD: "ZNEW" })).toBe("ZNEW");
    expect(unitCodeFor("ECO")).toBeNull();
  });

  it("expands synonyms into alternatives", () => {
    expect(alternativesOf("general studies")).toEqual(
      expect.arrayContaining([["general", "studies"], ["gst"], ["gns"], ["general", "education"], ["geds"]]),
    );
    expect(alternativesOf("intro to economics")).toEqual(expect.arrayContaining([["introduction", "to", "economics"]]));
  });

  it("builds a safe prefix query, folding accents", () => {
    expect(foldText("Yorùbá Drama")).toBe("yoruba drama");
    expect(tsQueryOf("Yorùbá dra")).toBe("(yoruba:* & dra:*)");
    expect(tsQueryOf("'; DROP TABLE x; --")).toBe("(drop:* & table:* & x:*)");
    expect(tsQueryOf("!!!")).toBeNull();
  });
});
