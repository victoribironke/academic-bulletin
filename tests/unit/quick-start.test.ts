import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DRAFT_SECTION_TITLES, quickStartFor, quickStartLabels } from "@/lib/help/quick-start";
import { approveActionLabel, REQUEST_REVISION_LABEL, STATUS_LABELS } from "@/lib/submissions/phases";

// Task H1: the quick start uses the exact words on the screens.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?)$/.test(name) ? [path] : [];
  });
}
const root = process.cwd();
const screens = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "components"))]
  .filter((path) => !path.includes(join("components", "layout", "help-button.tsx")))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

// Labels the screens build from the shared constants rather than spell out.
const fromConstants = new Set([approveActionLabel(2), approveActionLabel(3), REQUEST_REVISION_LABEL, STATUS_LABELS.CORRECTIONS_REQUIRED]);

describe("the quick start for each role (H1)", () => {
  const roles = ["HOD", "PROGRAMME_COORDINATOR", "DEAN", "ADMIN", "SUPER_ADMIN"];

  it("has a guide for each role", () => {
    expect(quickStartFor("HOD").title).toBe("Quick start for Heads of Department");
    expect(quickStartFor("PROGRAMME_COORDINATOR").title).toBe("Quick start for programme coordinators");
    expect(quickStartFor("DEAN").title).toBe("Quick start for Deans");
    expect(quickStartFor("ADMIN").title).toBe("Quick start for Academic Planning");
    expect(quickStartFor("HOD", "Monday, December 14, 2026").steps.join(" ")).toContain(
      "**Submit to School** (it opens on Monday, December 14, 2026)",
    );
    expect(quickStartFor("DEAN").steps.join(" ")).toContain("**Approve to DAP Vetting**");
  });

  it("quotes only words that are on the screens", () => {
    for (const role of roles) {
      const missing = quickStartLabels(quickStartFor(role)).filter(
        (label) => !fromConstants.has(label) && !screens.includes(label),
      );
      expect(missing, `${role} guide`).toEqual([]);
    }
  });

  it("names the draft's sections as the page does, and the page uses the shared action labels", () => {
    const page = readFileSync(join(root, "app/(main)/submissions/[id]/page.tsx"), "utf8");
    for (const title of DRAFT_SECTION_TITLES) expect(page).toContain(`title: "${title}"`);
    expect(screens).toContain("approveActionLabel(");
    expect(screens).toContain("REQUEST_REVISION_LABEL");
    expect(screens).toContain("STATUS_LABELS");
  });
});
