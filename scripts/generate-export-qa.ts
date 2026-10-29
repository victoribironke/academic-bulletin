import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateBulletinDocx } from "../lib/bulletin/export-docx";
import { generateBulletinPdf } from "../lib/bulletin/export-pdf";
import type { BulletinData } from "../lib/bulletin/generation";

const courseContent =
  "This course develops students' ability to investigate academic and professional problems using evidence, ethical reasoning, clear communication, and practical collaboration. It connects local needs with global standards and asks students to design responsible, innovative responses that can strengthen their communities.";

const courses = Array.from({ length: 12 }, (_, index) => ({
  code: `TST ${101 + index}`,
  title: `Representative Course With A Readable Long Title ${index + 1}`,
  units: 2,
  status: index % 4 === 0 ? "ELECTIVE" : "CORE",
  semester: index % 2 === 0 ? 1 : 2,
  level: index < 6 ? 100 : 200,
  prerequisites: index > 2 ? `TST ${98 + index}` : undefined,
  description: {
    learningOutcomes: [
      "Explain the central concepts and apply them to a realistic problem.",
      "Evaluate evidence and communicate a defensible recommendation.",
      "Design an ethical and practical response for a professional setting.",
    ],
    courseContent,
    entrepreneurialAspect:
      "Students develop a small implementation proposal, including users, resources, risks, and measures of success.",
  },
}));

const data: BulletinData = {
  level: "department",
  title: "Quality Assurance Academic Bulletin",
  generatedAt: new Date(),
  summary: { totalProgrammes: 1, totalCourses: courses.length, totalStaff: 3 },
  programmes: [
    {
      id: "qa-programme",
      name: "Quality Assurance Programme",
      code: "QAP",
      department: "Department of Quality Assurance",
      departmentCode: "QAD",
      school: "School of Academic Planning",
      schoolCode: "SAP",
      submissionStatus: "DRAFT",
      staff: [
        {
          id: "qa-staff-1",
          fullName: "Prof. Adaeze Chukwu",
          title: "Prof.",
          rank: "Professor",
          qualification: "Ph.D.",
          specialization: "Academic Planning and Quality Assurance",
          type: "ACADEMIC",
        },
        {
          id: "qa-staff-2",
          fullName: "Dr. Samuel Adeyemi",
          title: "Dr.",
          rank: "Senior Lecturer",
          qualification: "Ph.D.",
          specialization: "Curriculum Design",
          type: "ADJUNCT",
        },
        {
          id: "qa-staff-3",
          fullName: "Ms. Grace Okafor",
          title: "Ms.",
          rank: "Programme Administrator",
          qualification: "Master's Degree",
          specialization: "Programme Administration",
          type: "NON_ACADEMIC",
        },
      ],
      courses,
      content: {
        philosophy: courseContent.repeat(2),
        mission: "To provide rigorous, ethical, globally relevant, and practice-oriented education.",
        vision: "To be a trusted centre for excellent academic planning and quality assurance.",
        objectives: [
          "Develop graduates who can analyse evidence and solve complex institutional problems.",
          "Connect research, professional practice, service, and responsible innovation.",
        ],
        uniqueFeatures: ["Practice-based projects", "Interdisciplinary collaboration"],
        employability: ["Research", "Communication", "Project planning"],
        centurySkills: ["Critical thinking", "Digital collaboration"],
        utmeRequirements: "Five relevant credits, including English Language and Mathematics.",
        directEntryRequirements: "A relevant diploma or equivalent qualification.",
        minimumDuration: "4 years",
        graduationRequirements:
          "Students must pass every compulsory course and meet the minimum academic standard.\n\nLevel\tFirst\tSecond\tTotal\n100\t6\t6\t12\n200\t6\t6\t12\nTotal\t12\t12\t24",
        minimumCGPA: 2.5,
        totalUnits: 24,
      },
    },
  ],
};

async function main() {
  const outputDirectory = join(process.cwd(), ".qa", "exports");
  await mkdir(outputDirectory, { recursive: true });
  const [pdf, docx] = await Promise.all([
    generateBulletinPdf(data),
    generateBulletinDocx(data),
  ]);
  await Promise.all([
    writeFile(join(outputDirectory, "bulletin-qa.pdf"), pdf),
    writeFile(join(outputDirectory, "bulletin-qa.docx"), docx),
  ]);
  console.log(outputDirectory);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
