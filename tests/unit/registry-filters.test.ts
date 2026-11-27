import { describe, expect, it } from "vitest";
import { facetCounts, matchesFilters, readFilters, type RegistryRow } from "@/lib/courses/registry-filters";

// Task K5: the Course Registry's filters, with counts next to each choice.

const row = (id: string, over: Partial<RegistryRow> = {}): RegistryRow => ({
  id,
  level: 100,
  semester: 1,
  type: "CORE",
  ownership: "DEPARTMENT",
  school: { id: "s1", name: "Computing" },
  department: { id: "d1", name: "Computer Science" },
  programmes: [{ id: "p1", name: "B.Sc. Computer Science" }],
  source: "CCMAS 2023",
  hasDescription: true,
  grace: "CHECKED",
  ...over,
});

const rows = [
  row("a"),
  row("b", { level: 200, semester: null, hasDescription: false, grace: "NO_TEXT", source: null }),
  row("c", { department: { id: "d2", name: "Software Engineering" }, programmes: [{ id: "p1", name: "B.Sc. Computer Science" }, { id: "p2", name: "B.Sc. Software Engineering" }], grace: "NOT_CHECKED" }),
];

describe("Registry filters (K5)", () => {
  it("counts each choice with the other filters applied, not its own", () => {
    const facets = facetCounts(rows, { described: "yes" });
    // Description counts ignore the description filter itself.
    expect(facets.described).toEqual([
      { value: "yes", label: "Has a description", count: 2 },
      { value: "no", label: "No description yet", count: 1 },
    ]);
    // Other facets count only courses with a description.
    expect(facets.level).toEqual([{ value: "100", label: "100 level", count: 2 }]);
    expect(facets.grace.map((choice) => [choice.value, choice.count])).toEqual([
      ["checked", 1],
      ["not", 1],
    ]);
    // A course used by two programmes counts under each.
    expect(facets.programme.map((choice) => [choice.value, choice.count])).toEqual([
      ["p1", 2],
      ["p2", 1],
    ]);
  });

  it("filters on every facet together", () => {
    expect(rows.filter((item) => matchesFilters(item, { programme: "p1", grace: "checked" })).map((item) => item.id)).toEqual(["a"]);
    expect(rows.filter((item) => matchesFilters(item, { semester: "sessional" })).map((item) => item.id)).toEqual(["b"]);
    expect(rows.filter((item) => matchesFilters(item, { source: "none" })).map((item) => item.id)).toEqual(["b"]);
    expect(rows.filter((item) => matchesFilters(item, { department: "d2", level: "all" })).map((item) => item.id)).toEqual(["c"]);
  });

  it("reads only known filters from the address", () => {
    expect(readFilters(new URLSearchParams("level=100&grace=checked&page=2&evil=1&type=all"))).toEqual({ level: "100", grace: "checked" });
  });
});
