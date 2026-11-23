import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PHASES,
  STATUS_LABELS,
  approveActionLabel,
  phaseHeading,
} from "@/lib/submissions/phases";

// Task Q6: the work order's phase names everywhere, with the numbers 1 to 10 unchanged.

describe("phase names (Q6)", () => {
  it("uses the new names, short labels and owners, numbered 1 to 10", () => {
    expect(PHASES.map((phase) => phase.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(PHASES.map((phase) => phase.name)).toEqual([
      "Departmental Drafting",
      "School Board Harmonisation",
      "Academic Planning Vetting",
      "Departmental Revision",
      "Consolidation and Sign-off",
      "Senate Approval",
      "Copy-Editing",
      "Typesetting and Proofs",
      "Digital Publication",
      "Errata and Archiving",
    ]);
    expect(PHASES.find((phase) => phase.number === 2)).toMatchObject({ short: "School Board", owner: "Dean" });
    expect(phaseHeading(3)).toBe("Phase 3 of 10: Academic Planning Vetting");
    expect(STATUS_LABELS.CORRECTIONS_REQUIRED).toBe("Revision requested");
  });

  it("names what each approval does", () => {
    expect(approveActionLabel(2)).toBe("Approve to DAP Vetting");
    expect(approveActionLabel(5)).toBe("Approve for Senate");
  });

  it("leaves none of the old names on any screen, email or export", () => {
    const banned = [
      "Dept Prep/Review",
      "Corrections Required",
      "Send to Department for corrections",
      "Post-Release",
      "School Board Review",
      "Approve phase",
    ];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name)) files.push(path);
      }
    };
    for (const dir of ["app", "components", "lib"]) walk(join(process.cwd(), dir));
    const found = files.flatMap((file) => {
      // Comments may mention the old names when explaining the change.
      const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      return banned.filter((name) => code.includes(name)).map((name) => `${file}: ${name}`);
    });
    expect(found).toEqual([]);
  });
});
