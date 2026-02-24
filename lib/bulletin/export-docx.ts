/**
 * Word Document (.docx) Generator for Academic Bulletin
 *
 * Uses the `docx` library to generate a professionally formatted Word document
 * from BulletinData.
 */

import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  Packer,
  ShadingType,
  TableLayoutType,
} from "docx";
import type {
  BulletinData,
  BulletinProgramme,
  BulletinCourse,
} from "./generation";

// ── Helpers ──────────────────────────────────────────────────────────────────

function heading(
  text: string,
  level: (typeof HeadingLevel)[keyof typeof HeadingLevel],
) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true })],
  });
}

function paragraph(
  text: string,
  opts?: { bold?: boolean; italic?: boolean; spacing?: number },
) {
  return new Paragraph({
    spacing: { after: opts?.spacing ?? 80 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        italics: opts?.italic,
      }),
    ],
  });
}

function numberedItem(index: number, text: string) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${index}. `, bold: true }),
      new TextRun({ text }),
    ],
  });
}

function bulletItem(text: string) {
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: 360 },
    children: [new TextRun({ text: `• ${text}` })],
  });
}

const CELL_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1 },
  bottom: { style: BorderStyle.SINGLE, size: 1 },
  left: { style: BorderStyle.SINGLE, size: 1 },
  right: { style: BorderStyle.SINGLE, size: 1 },
};

function headerCell(text: string, width?: number) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    borders: CELL_BORDERS,
    shading: { type: ShadingType.SOLID, color: "E2E8F0" },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 20 })],
      }),
    ],
  });
}

function cell(text: string, width?: number) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    borders: CELL_BORDERS,
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 20 })],
      }),
    ],
  });
}

// ── Section Generators ───────────────────────────────────────────────────────

function generateTitlePage(prog: BulletinProgramme): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 2400 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: prog.school.toUpperCase(), bold: true, size: 32 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `Department of ${prog.department}`,
          bold: true,
          size: 28,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: prog.name, bold: true, size: 36 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [
        new TextRun({
          text: "ACADEMIC BULLETIN",
          bold: true,
          size: 32,
        }),
      ],
    }),
  ];
}

function generateStaffSection(prog: BulletinProgramme): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  elements.push(heading("1. Staff Directory", HeadingLevel.HEADING_1));

  const staffGroups = [
    { label: "Academic Staff", type: "ACADEMIC" },
    { label: "Adjunct Academic Staff", type: "ADJUNCT" },
    { label: "Non-Academic Staff", type: "NON_ACADEMIC" },
  ];

  for (const group of staffGroups) {
    const members = prog.staff.filter((s) => s.type === group.type);
    elements.push(heading(group.label, HeadingLevel.HEADING_2));

    if (members.length === 0) {
      elements.push(
        paragraph("No staff listed in this category.", { italic: true }),
      );
      continue;
    }

    const headerRow = new TableRow({
      children: [
        headerCell("S/N", 8),
        headerCell("Name", 30),
        headerCell("Rank", 22),
        headerCell("Specialization", 22),
        headerCell("Qualification", 18),
      ],
    });

    const dataRows = members.map(
      (s, i) =>
        new TableRow({
          children: [
            cell(String(i + 1), 8),
            cell(s.fullName, 30),
            cell(s.rank, 22),
            cell(s.specialization || "—", 22),
            cell(s.qualification, 18),
          ],
        }),
    );

    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        rows: [headerRow, ...dataRows],
      }),
    );

    elements.push(new Paragraph({ spacing: { after: 200 } }));
  }

  return elements;
}

function generatePhilosophySection(prog: BulletinProgramme): Paragraph[] {
  const c = prog.content;
  const elements: Paragraph[] = [];
  elements.push(
    heading("2. Programme Philosophy & Objectives", HeadingLevel.HEADING_1),
  );

  if (c?.philosophy) {
    elements.push(heading("Philosophy", HeadingLevel.HEADING_2));
    elements.push(paragraph(c.philosophy));
  }

  if (c?.mission) {
    elements.push(heading("Mission", HeadingLevel.HEADING_2));
    elements.push(paragraph(c.mission));
  }

  if (c?.vision) {
    elements.push(heading("Vision", HeadingLevel.HEADING_2));
    elements.push(paragraph(c.vision));
  }

  if (c?.objectives && c.objectives.length > 0) {
    elements.push(heading("Programme Objectives", HeadingLevel.HEADING_2));
    c.objectives.forEach((obj, i) => {
      elements.push(numberedItem(i + 1, obj));
    });
  }

  if (c?.uniqueFeatures && c.uniqueFeatures.length > 0) {
    elements.push(heading("Unique Features", HeadingLevel.HEADING_2));
    c.uniqueFeatures.forEach((f) => elements.push(bulletItem(f)));
  }

  if (c?.employability) {
    elements.push(heading("Employability Skills", HeadingLevel.HEADING_2));
    elements.push(paragraph(c.employability));
  }

  if (c?.centurySkills && c.centurySkills.length > 0) {
    elements.push(heading("21st Century Skills", HeadingLevel.HEADING_2));
    c.centurySkills.forEach((s) => elements.push(bulletItem(s)));
  }

  return elements;
}

function generateAdmissionSection(prog: BulletinProgramme): Paragraph[] {
  const c = prog.content;
  const elements: Paragraph[] = [];
  elements.push(
    heading("3. Admission & Graduation Requirements", HeadingLevel.HEADING_1),
  );

  if (c?.utmeRequirements) {
    elements.push(heading("UTME Entry Requirements", HeadingLevel.HEADING_2));
    elements.push(paragraph(c.utmeRequirements));
  }

  if (c?.directEntryRequirements) {
    elements.push(heading("Direct Entry Requirements", HeadingLevel.HEADING_2));
    elements.push(paragraph(c.directEntryRequirements));
  }

  if (c?.transferRequirements) {
    elements.push(
      heading("Inter-University Transfer Requirements", HeadingLevel.HEADING_2),
    );
    elements.push(paragraph(c.transferRequirements));
  }

  if (c?.minimumDuration) {
    elements.push(heading("Programme Duration", HeadingLevel.HEADING_2));
    elements.push(paragraph(`Minimum Duration: ${c.minimumDuration} years`));
  }

  if (c?.graduationRequirements) {
    elements.push(heading("Graduation Requirements", HeadingLevel.HEADING_2));
    elements.push(paragraph(c.graduationRequirements));
  }

  if (c?.minimumCGPA) {
    elements.push(paragraph(`Minimum CGPA: ${c.minimumCGPA}`, { bold: true }));
  }

  if (c?.totalUnits) {
    elements.push(
      paragraph(`Total Required Units: ${c.totalUnits}`, { bold: true }),
    );
  }

  return elements;
}

function generateCourseStructureSection(
  courses: BulletinCourse[],
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  elements.push(
    heading("4. Programme Course Structure", HeadingLevel.HEADING_1),
  );

  // Group courses by level and semester
  const grouped: Record<number, Record<number, BulletinCourse[]>> = {};
  for (const course of courses) {
    if (!grouped[course.level]) grouped[course.level] = {};
    if (!grouped[course.level][course.semester])
      grouped[course.level][course.semester] = [];
    grouped[course.level][course.semester].push(course);
  }

  const levels = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

  for (const level of levels) {
    elements.push(heading(`${level} Level`, HeadingLevel.HEADING_2));

    const semesters = Object.keys(grouped[level])
      .map(Number)
      .sort((a, b) => a - b);

    for (const semester of semesters) {
      const semCourses = grouped[level][semester];
      elements.push(
        paragraph(`${semester === 1 ? "First" : "Second"} Semester`, {
          bold: true,
          spacing: 120,
        }),
      );

      const headerRow = new TableRow({
        children: [
          headerCell("Code", 15),
          headerCell("Title", 45),
          headerCell("Status", 15),
          headerCell("Units", 10),
          headerCell("Prerequisites", 15),
        ],
      });

      const dataRows = semCourses.map(
        (c) =>
          new TableRow({
            children: [
              cell(c.code, 15),
              cell(c.title, 45),
              cell(c.status, 15),
              cell(String(c.units), 10),
              cell(c.prerequisites || "—", 15),
            ],
          }),
      );

      // Total row
      const totalUnits = semCourses.reduce((sum, c) => sum + c.units, 0);
      const totalRow = new TableRow({
        children: [
          cell("", 15),
          new TableCell({
            width: { size: 45, type: WidthType.PERCENTAGE },
            borders: CELL_BORDERS,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: "Total", bold: true, size: 20 }),
                ],
              }),
            ],
          }),
          cell("", 15),
          new TableCell({
            width: { size: 10, type: WidthType.PERCENTAGE },
            borders: CELL_BORDERS,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: String(totalUnits),
                    bold: true,
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
          cell("", 15),
        ],
      });

      elements.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [headerRow, ...dataRows, totalRow],
        }),
      );

      elements.push(new Paragraph({ spacing: { after: 200 } }));
    }
  }

  return elements;
}

function generateCourseDescriptionsSection(
  courses: BulletinCourse[],
): Paragraph[] {
  const elements: Paragraph[] = [];
  elements.push(heading("5. Course Descriptions", HeadingLevel.HEADING_1));

  const coursesWithDesc = courses.filter((c) => c.description);

  if (coursesWithDesc.length === 0) {
    elements.push(
      paragraph("No course descriptions available.", { italic: true }),
    );
    return elements;
  }

  for (const course of coursesWithDesc) {
    const desc = course.description!;

    elements.push(
      heading(
        `${course.code}: ${course.title} (${course.units} Units)`,
        HeadingLevel.HEADING_2,
      ),
    );

    if (desc.learningOutcomes && desc.learningOutcomes.length > 0) {
      elements.push(paragraph("Learning Outcomes:", { bold: true }));
      desc.learningOutcomes.forEach((outcome, i) => {
        elements.push(numberedItem(i + 1, outcome));
      });
    }

    if (desc.courseContent) {
      elements.push(paragraph("Course Content:", { bold: true }));
      elements.push(paragraph(desc.courseContent));
    }

    if (desc.labWork) {
      elements.push(paragraph("Lab/Practical Work:", { bold: true }));
      elements.push(paragraph(desc.labWork));
    }

    if (desc.entrepreneurialAspect) {
      elements.push(
        paragraph("Entrepreneurial/Practical Aspect:", { bold: true }),
      );
      elements.push(paragraph(desc.entrepreneurialAspect));
    }

    elements.push(new Paragraph({ spacing: { after: 200 } }));
  }

  return elements;
}

// ── Main Export ──────────────────────────────────────────────────────────────

export async function generateBulletinDocx(
  data: BulletinData,
): Promise<Buffer> {
  if (data.programmes.length === 0)
    throw new Error("No programme data available for export");

  // Build children for all programmes with section breaks between them
  const children: (Paragraph | Table)[] = [];

  for (const prog of data.programmes) {
    children.push(
      ...generateTitlePage(prog),
      ...generateStaffSection(prog),
      ...generatePhilosophySection(prog),
      ...generateAdmissionSection(prog),
      ...generateCourseStructureSection(prog.courses),
      ...generateCourseDescriptionsSection(prog.courses),
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { size: 24, font: "Times New Roman" },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
