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
      "Credit Summary",
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

  it("prints the credit summary, graduation numbers and description layout the app builds (W4, W5, W15)", async () => {
    const programme = bulletin.programmes[0];
    const withRules: BulletinData = {
      ...bulletin,
      programmes: [
        {
          ...programme,
          electiveGroups: [{ id: "g1", name: "100 level electives", chooseUnits: 2 }],
          courses: [
            { ...programme.courses[0], generalEducation: false, owned: true, lectureHours: 45, practicalHours: 0 },
            { code: "GST 111", title: "Communication in English", units: 2, status: "CORE", semester: 1, level: 100, generalEducation: true, owned: false },
            { code: "MTH 101", title: "Elementary Mathematics I", units: 3, status: "CORE", semester: 1, level: 100, generalEducation: false, owned: false },
            { code: "CSC 103", title: "Computing Ethics", units: 2, status: "ELECTIVE", semester: 1, level: 100, owned: true, electiveGroupId: "g1" },
            { code: "CSC 105", title: "Computing History", units: 2, status: "ELECTIVE", semester: 1, level: 100, owned: true, electiveGroupId: "g1" },
          ],
        },
      ],
    };
    const xml = await JSZip.loadAsync(await generateBulletinDocx(withRules)).then((zip) => zip.file("word/document.xml")!.async("string"));
    for (const header of ["General Education", "Departmental", "Non-departmental"]) expect(xml).toContain(header);
    // 3 + 2 chosen from the group = 5 departmental, 3 outside, 2 General Education: 10.
    expect(xml).toContain(
      "To graduate, a student must earn at least 10 credits: 5 in the department&apos;s own courses, 3 in courses from other departments, and 2 in General Education.",
    );
    expect(xml).toContain("CSC 101: Introduction to Computing (3 units, Core; 45 lecture hours, 0 practical hours)");
    expect(xml).toContain("At the end of this course, students should be able to:");
    // Q4: the title and full name under the Dean's and Head's places.
    const withLeaders = await JSZip.loadAsync(
      await generateBulletinDocx({
        ...withRules,
        programmes: [
          {
            ...withRules.programmes[0],
            leaders: { dean: { title: "Prof.", name: "Ada Dean", imageUrl: null }, hod: { title: "Dr.", name: "Bo Head", imageUrl: null } },
          },
        ],
      }),
    ).then((zip) => zip.file("word/document.xml")!.async("string"));
    expect(withLeaders).toContain("Prof. Ada Dean");
    expect(withLeaders).toContain("Dr. Bo Head");
    expect(withLeaders.indexOf("Prof. Ada Dean")).toBeLessThan(withLeaders.indexOf("Head of Department"));
    expect((await generateBulletinPdf(withRules)).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("generates a valid PDF document", async () => {
    const output = await generateBulletinPdf(bulletin);
    expect(output.subarray(0, 4).toString()).toBe("%PDF");
    expect(output.length).toBeGreaterThan(1_000);
  });
});
