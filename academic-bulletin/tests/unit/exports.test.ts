import { describe, expect, it } from "vitest";
import { generateBulletinDocx } from "@/lib/bulletin/export-docx";
import { generateBulletinPdf } from "@/lib/bulletin/export-pdf";
import type { BulletinData } from "@/lib/bulletin/generation";

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
      staff: [],
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
    },
  ],
  summary: { totalProgrammes: 1, totalCourses: 1, totalStaff: 0 },
};

describe("bulletin exports", () => {
  it("generates a valid Word package", async () => {
    const output = await generateBulletinDocx(bulletin);
    expect(output.subarray(0, 2).toString()).toBe("PK");
    expect(output.length).toBeGreaterThan(1_000);
  });

  it("generates a valid PDF document", async () => {
    const output = await generateBulletinPdf(bulletin);
    expect(output.subarray(0, 4).toString()).toBe("%PDF");
    expect(output.length).toBeGreaterThan(1_000);
  });
});
