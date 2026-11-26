import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { UNIVERSITY_ADMISSION, admissionWordingProblems } from "@/lib/bulletin/admission-wording";
import { generateBulletinDocx } from "@/lib/bulletin/export-docx";
import type { BulletinData } from "@/lib/bulletin/generation";

// Rule W13 (university-wide admission wording) and V7 (Direct Entry and
// Transfer differ from UTME).

describe("admission wording (W13, V7)", () => {
  it("states the Academic Policy's university-wide rules", () => {
    expect(UNIVERSITY_ADMISSION.utme.text).toContain("five credit passes (C6 or better)");
    expect(UNIVERSITY_ADMISSION.utme.text).toContain("English Language for every programme");
    expect(UNIVERSITY_ADMISSION.directEntry.text).toContain("100 or 200 level");
    expect(UNIVERSITY_ADMISSION.transfer.text).toContain("Up to 84 credits");
    expect(UNIVERSITY_ADMISSION.transfer.text).toContain("three years at Babcock University");
  });

  it("flags Direct Entry or Transfer wording that only repeats UTME", () => {
    const utme = "Credits in Physics, Chemistry and Biology.";
    expect(admissionWordingProblems({ utmeRequirements: utme, directEntryRequirements: "credits in physics chemistry and biology", transferRequirements: "A C in 30 credits." })).toEqual([
      "The Direct Entry requirements repeat the UTME wording; say what Direct Entry candidates need instead.",
    ]);
    expect(admissionWordingProblems({ utmeRequirements: utme, directEntryRequirements: "Two A-level passes.", transferRequirements: utme })).toHaveLength(1);
    expect(admissionWordingProblems({ utmeRequirements: "", directEntryRequirements: "", transferRequirements: "" })).toEqual([]);
  });

  it("prints the university wording before the programme's own in the bulletin", async () => {
    const data: BulletinData = {
      level: "department",
      title: "Test",
      generatedAt: new Date("2026-11-26T00:00:00Z"),
      programmes: [
        {
          id: "p", name: "Test Studies", code: "T", department: "Testing", departmentCode: "T", school: "Tests", schoolCode: "TS",
          submissionStatus: "APPROVED", staff: [], courses: [],
          content: { utmeRequirements: "Credits in Physics, Chemistry and Biology." },
        },
      ],
      summary: { totalProgrammes: 1, totalCourses: 0, totalStaff: 0 },
    };
    const xml = await JSZip.loadAsync(await generateBulletinDocx(data)).then((zip) => zip.file("word/document.xml")!.async("string"));
    const university = xml.indexOf("five credit passes (C6 or better)");
    const programme = xml.indexOf("Credits in Physics, Chemistry and Biology.");
    expect(university).toBeGreaterThan(0);
    expect(programme).toBeGreaterThan(university);
    expect(xml).toContain("three years at Babcock University");
  });
});
