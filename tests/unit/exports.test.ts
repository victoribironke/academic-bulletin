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

  it("follows the same page order on every programme (W14)", async () => {
    const order = (xml: string, labels: string[]) => labels.map((label) => xml.indexOf(label));
    const plain = await JSZip.loadAsync(await generateBulletinDocx(bulletin)).then((zip) => zip.file("word/document.xml")!.async("string"));
    // No university wording yet: nothing is printed for it.
    expect(plain).not.toContain("Babcock University: Vision and Mission");
    const positions = order(plain, [
      "1. Programme Vision, Mission, Philosophy and Objectives",
      "A complete programme vision.",
      "A complete programme mission.",
      "A complete programme philosophy.",
      "2. Admission and Graduation Requirements",
      "Credit Requirements Summary",
      "3. Programme Course Structure",
      "4. Course Descriptions",
      "5. Staff Directory",
    ]);
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    const withUniversity = await JSZip.loadAsync(
      await generateBulletinDocx({ ...bulletin, university: { vision: "The university vision.", mission: "The university mission." } }),
    ).then((zip) => zip.file("word/document.xml")!.async("string"));
    const first = order(withUniversity, ["Babcock University: Vision and Mission", "The university vision.", "The university mission.", "1. Programme Vision"]);
    expect(first.every((position) => position >= 0)).toBe(true);
    expect([...first].sort((a, b) => a - b)).toEqual(first);
    const pdf = await generateBulletinPdf({ ...bulletin, university: { vision: "The university vision.", mission: null } });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("generates a valid PDF document", async () => {
    const output = await generateBulletinPdf(bulletin);
    expect(output.subarray(0, 4).toString()).toBe("%PDF");
    expect(output.length).toBeGreaterThan(1_000);
  });
});
