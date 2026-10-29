import { describe, expect, it } from "vitest";
import {
  departmentLabel,
  durationLabel,
  parseStructuredText,
} from "@/lib/bulletin/document-utils";
import { validateBulletinData } from "@/lib/bulletin/validation";
import type { BulletinData } from "@/lib/bulletin/generation";

function completeBulletin(): BulletinData {
  return {
    level: "department",
    title: "Law Academic Bulletin",
    generatedAt: new Date("2026-10-29T00:00:00Z"),
    summary: { totalProgrammes: 1, totalCourses: 1, totalStaff: 1 },
    programmes: [
      {
        id: "law",
        name: "Law",
        code: "LAW",
        department: "Department of Law",
        departmentCode: "LAW",
        school: "School of Law",
        schoolCode: "SLS",
        submissionStatus: "APPROVED",
        staff: [
          {
            id: "staff-1",
            fullName: "Dr Ada Example",
            title: "Dr.",
            rank: "Senior Lecturer",
            qualification: "Ph.D.",
            type: "ACADEMIC",
          },
        ],
        courses: [
          {
            code: "LAW 101",
            title: "Introduction to Law",
            units: 3,
            status: "CORE",
            semester: 1,
            level: 100,
            description: {
              learningOutcomes: ["Explain the foundations of law"],
              courseContent: "Sources, institutions, and methods of law.",
            },
          },
        ],
        content: {
          philosophy: "A complete philosophy.",
          mission: "A complete mission.",
          vision: "A complete vision.",
          utmeRequirements: "Five relevant credits.",
          graduationRequirements: "Complete all required courses.",
          totalUnits: 3,
        },
      },
    ],
  };
}

describe("bulletin document utilities", () => {
  it("does not duplicate department or duration wording", () => {
    expect(departmentLabel("Department of Law")).toBe("Department of Law");
    expect(departmentLabel("Computing")).toBe("Department of Computing");
    expect(durationLabel("5 years")).toBe("5 years");
    expect(durationLabel("5")).toBe("5 years");
  });

  it("turns tab-separated pasted content into a real table block", () => {
    expect(parseStructuredText("Intro\n\nLevel\tFirst\tTotal\n100\t16\t33")).toEqual([
      { type: "paragraph", text: "Intro" },
      {
        type: "table",
        rows: [
          ["Level", "First", "Total"],
          ["100", "16", "33"],
        ],
      },
    ]);
  });
});

describe("bulletin completeness validation", () => {
  it("accepts a complete and internally consistent bulletin", () => {
    expect(validateBulletinData(completeBulletin())).toEqual([]);
  });

  it("reports missing staff, incomplete course details, and unit mismatches", () => {
    const data = completeBulletin();
    data.programmes[0].staff = [];
    data.programmes[0].courses[0].description = undefined;
    data.programmes[0].content!.totalUnits = 218;
    expect(validateBulletinData(data).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "NO_STAFF",
        "INCOMPLETE_COURSE_DETAILS",
        "UNIT_TOTAL_MISMATCH",
      ]),
    );
  });
});
