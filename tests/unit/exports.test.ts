import { describe, expect, it } from "vitest";
import { generateBulletinDocx } from "@/lib/bulletin/export-docx";
import { generateBulletinPdf } from "@/lib/bulletin/export-pdf";
import type { BulletinData } from "@/lib/bulletin/generation";
import JSZip from "jszip";

const bulletin: BulletinData = {
  level: "department",
  title: "Computer Science Academic Bulletin",
  generatedAt: new Date("2026-10-12T00:00:00.000Z"),
  programmes: [
    {
      id: "programme-1",
      name: "Computer Science",
      code: "CSC",
      department: "Computing",
      departmentCode: "CSC",
      school: "Computing and Engineering",
      schoolCode: "SCE",
      submissionStatus: "APPROVED",
      staff: [
        {
          id: "staff-1",
          fullName: "Dr Ada Example",
          title: "Dr.",
          rank: "Senior Lecturer",
          qualification: "Ph.D.",
          specialization: "Computing Education",
          type: "ACADEMIC",
        },
      ],
      courses: [
        {
          code: "CSC 101",
          title: "Introduction to Computing",
          units: 3,
          status: "CORE",
          semester: 1,
          level: 100,
          description: {
            learningOutcomes: ["Explain foundational computing concepts"],
            courseContent: "Computing systems and problem solving.",
          },
        },
      ],
      content: {
        philosophy: "A complete programme philosophy.",
        mission: "A complete programme mission.",
        vision: "A complete programme vision.",
        utmeRequirements: "Five relevant credits.",
        graduationRequirements:
          "Complete all required courses.\n\nLevel\tFirst\tSecond\tTotal\n100\t3\t0\t3",
        minimumDuration: "4 years",
        totalUnits: 3,
      },
    },
  ],
  summary: { totalProgrammes: 1, totalCourses: 1, totalStaff: 0 },
};

describe("bulletin exports", () => {
  it("generates a valid Word package", async () => {
    const output = await generateBulletinDocx(bulletin);
    expect(output.subarray(0, 2).toString()).toBe("PK");
    expect(output.length).toBeGreaterThan(1_000);
    const zip = await JSZip.loadAsync(output);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    expect(documentXml).toContain("Department of Computing");
    expect(documentXml).not.toContain("Department of Department of");
    expect(documentXml).toContain("Minimum Duration: 4 years");
    expect(documentXml).not.toContain("years years");
    expect(documentXml).toContain("w:type=\"page\"");
    expect(zip.file("word/footer1.xml")).toBeTruthy();
  });

  it("generates a valid PDF document", async () => {
    const output = await generateBulletinPdf(bulletin);
    expect(output.subarray(0, 4).toString()).toBe("%PDF");
    expect(output.length).toBeGreaterThan(1_000);
  });
});
