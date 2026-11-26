import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { baselineFor, baselineValue, carryPlan, stillCarried, summaryOfChanges } from "@/lib/bulletin/baseline";
import { CARRIED_FIELDS, carriedIssues, carriedText, diffWords } from "@/lib/bulletin/carried-fields";

// Tasks E2 and E3: the 2023-2027 text a draft starts from, rule V18, the
// compare view and the first Summary of Changes.

describe("the 2023-2027 baseline (E2)", () => {
  it("holds the 48 existing programmes, with no staff list in it", () => {
    const raw = readFileSync(path.resolve(__dirname, "../../data/bulletin/baseline-2023-2027.json"), "utf8");
    const programmes = JSON.parse(raw).programmes as Record<string, unknown>;
    expect(Object.keys(programmes)).toHaveLength(48);
    expect(raw).not.toMatch(/@babcock\.edu\.ng|Senior Lecturer|Graduate Assistant|List of Faculty/);
    expect(baselineFor("VSSS-ECO-ECO")?.fields.philosophy).toMatch(/^To train the Economics students/);
    expect(baselineFor("SBMS-DEN-BDS")).toBeNull();
  });

  it("fills only what a draft has left empty, and marks each filled field", () => {
    const baseline = baselineFor("SOCO-COS-COS")!;
    const plan = carryPlan(baseline, { philosophy: "Our own philosophy.", vision: "" });
    expect(plan.carried).not.toContain("philosophy");
    expect(plan.carried).toEqual(expect.arrayContaining(["objectives", "uniqueFeatures", "utmeRequirements", "graduationRequirements"]));
    expect(plan.patch.philosophy).toBeUndefined();
    expect(Array.isArray(plan.patch.objectives)).toBe(true);
    // Employability is kept as one text in the draft.
    expect(typeof plan.patch.employability).toBe("string");
  });

  it("keeps a field carried until its text changes (V18)", () => {
    const baseline = baselineFor("SOCO-COS-COS")!;
    const { patch, carried } = carryPlan(baseline, null);
    expect(stillCarried(carried, baseline, patch)).toEqual(carried);
    // Whitespace and list markers don't count as an edit.
    const objectives = (patch.objectives as string[]).map((item) => `  ${item}  `);
    expect(stillCarried(["objectives"], baseline, { ...patch, objectives })).toEqual(["objectives"]);
    expect(stillCarried(carried, baseline, { ...patch, philosophy: `${patch.philosophy} Revised.` })).not.toContain("philosophy");
  });

  it("says which sections still need review, one issue per section", () => {
    expect(carriedIssues(["vision", "objectives", "graduationRequirements"])).toEqual([
      { code: "CARRIED_OVERVIEW", message: expect.stringContaining("(Vision, Objectives)") },
      { code: "CARRIED_GRADUATION", message: expect.stringContaining("Graduation requirements") },
    ]);
    expect(carriedIssues([])).toEqual([]);
    expect(CARRIED_FIELDS.map((field) => field.key)).not.toContain("minimumCGPA");
  });
});

describe("compare with 2023-2027 and the Summary of Changes (E3)", () => {
  it("marks the words removed and added", () => {
    const parts = diffWords("Train students in economics", "Train graduates in economics and policy");
    expect(parts.filter((part) => part.change === "removed").map((part) => part.text.trim())).toContain("students");
    expect(parts.filter((part) => part.change === "added").map((part) => part.text).join("")).toContain("graduates");
    expect(carriedText("html", "<p>One</p><p>Two&nbsp;lines</p>")).toBe("One\nTwo lines");
  });

  it("drafts the summary from the text and course differences, leaving General Education out", () => {
    const baseline = baselineFor("VSSS-ECO-ECO")!;
    const content = carryPlan(baseline, null).patch;
    const courses = baseline.courses.map((course) => ({ ...course, status: course.status === "E" ? "ELECTIVE" : "CORE" }));
    expect(summaryOfChanges(baseline, content, courses)).toBe("<p>No changes from the 2023-2027 bulletin so far.</p>");

    const first = courses.find((course) => !/GST|ENT/.test(course.code))!;
    const changed = courses.filter((course) => course.code !== first.code).concat([{ code: "ECO 499", title: "New Seminar", units: 2, level: 400, semester: 2, status: "CORE" }]);
    const html = summaryOfChanges(baseline, { ...content, philosophy: "A new philosophy." }, changed);
    expect(html).toContain("Philosophy: revised.");
    expect(html).toContain("ECO 499 New Seminar");
    expect(html).toContain(`${first.code} ${first.title}.`);
    expect(html).not.toMatch(/GST 111|BU-GST/);
    expect(baselineValue(baseline, "minimumCGPA")).toBeNull();
  });
});
