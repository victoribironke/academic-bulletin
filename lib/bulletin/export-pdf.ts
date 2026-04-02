/**
 * PDF Generator for Academic Bulletin
 *
 * Uses `pdfkit` to generate a professionally formatted PDF from BulletinData.
 */

import PDFDocument from "pdfkit";
import type {
  BulletinData,
  BulletinProgramme,
  BulletinCourse,
} from "./generation";

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(html?: string) {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "").trim();
}

const MARGIN = 60;
const PAGE_WIDTH = 612; // Letter size
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

function ensureSpace(doc: InstanceType<typeof PDFDocument>, needed: number) {
  if (doc.y + needed > doc.page.height - MARGIN) {
    doc.addPage();
  }
}

function sectionHeading(doc: InstanceType<typeof PDFDocument>, text: string) {
  ensureSpace(doc, 40);
  doc.moveDown(0.5);
  doc.fontSize(16).font("Helvetica-Bold").text(text);
  doc.moveDown(0.3);
  // Underline
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(MARGIN + CONTENT_WIDTH, doc.y)
    .stroke("#333333");
  doc.moveDown(0.3);
}

function subHeading(doc: InstanceType<typeof PDFDocument>, text: string) {
  ensureSpace(doc, 30);
  doc.moveDown(0.3);
  doc.fontSize(13).font("Helvetica-Bold").text(text);
  doc.moveDown(0.2);
}

function bodyText(doc: InstanceType<typeof PDFDocument>, text: string) {
  doc.fontSize(11).font("Helvetica").text(text, { lineGap: 3 });
  doc.moveDown(0.2);
}

function boldText(doc: InstanceType<typeof PDFDocument>, text: string) {
  doc.fontSize(11).font("Helvetica-Bold").text(text, { lineGap: 3 });
  doc.moveDown(0.2);
}

// Simple table drawing
function drawTable(
  doc: InstanceType<typeof PDFDocument>,
  headers: string[],
  rows: string[][],
  colWidths: number[],
) {
  const rowHeight = 22;
  const totalHeight = (rows.length + 1) * rowHeight + 10;
  ensureSpace(doc, Math.min(totalHeight, 200));

  const startX = MARGIN;
  let y = doc.y;

  // Header row
  doc.fontSize(9).font("Helvetica-Bold");
  let x = startX;
  doc.rect(x, y, CONTENT_WIDTH, rowHeight).fill("#E2E8F0").stroke("#CBD5E1");
  doc.fillColor("#1A202C");

  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + 4, y + 5, { width: colWidths[i] - 8 });
    x += colWidths[i];
  }
  y += rowHeight;

  // Data rows
  doc.fontSize(9).font("Helvetica").fillColor("#000000");
  for (const row of rows) {
    if (y + rowHeight > doc.page.height - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }

    x = startX;
    doc.rect(x, y, CONTENT_WIDTH, rowHeight).stroke("#CBD5E1");

    for (let i = 0; i < row.length; i++) {
      doc.text(row[i] || "—", x + 4, y + 5, { width: colWidths[i] - 8 });
      x += colWidths[i];
    }
    y += rowHeight;
  }

  doc.y = y + 10;
}

// ── Section Generators ───────────────────────────────────────────────────────

function generateTitlePage(
  doc: InstanceType<typeof PDFDocument>,
  prog: BulletinProgramme,
) {
  doc.moveDown(6);
  doc
    .fontSize(18)
    .font("Helvetica-Bold")
    .text(prog.school.toUpperCase(), { align: "center" });
  doc.moveDown(0.5);
  doc
    .fontSize(15)
    .text(`Department of ${prog.department}`, { align: "center" });
  doc.moveDown(1);
  doc.fontSize(22).text(prog.name, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(18).text("ACADEMIC BULLETIN", { align: "center" });
  doc.addPage();
}

function generateStaffSection(
  doc: InstanceType<typeof PDFDocument>,
  prog: BulletinProgramme,
) {
  sectionHeading(doc, "1. Staff Directory");

  const groups = [
    { label: "Academic Staff", type: "ACADEMIC" },
    { label: "Adjunct Academic Staff", type: "ADJUNCT" },
    { label: "Non-Academic Staff", type: "NON_ACADEMIC" },
  ];

  const colWidths = [
    CONTENT_WIDTH * 0.08,
    CONTENT_WIDTH * 0.3,
    CONTENT_WIDTH * 0.22,
    CONTENT_WIDTH * 0.22,
    CONTENT_WIDTH * 0.18,
  ];

  for (const group of groups) {
    const members = prog.staff.filter((s) => s.type === group.type);
    subHeading(doc, group.label);

    if (members.length === 0) {
      doc
        .fontSize(10)
        .font("Helvetica-Oblique")
        .text("No staff listed in this category.");
      doc.moveDown(0.3);
      continue;
    }

    drawTable(
      doc,
      ["S/N", "Name", "Rank", "Specialization", "Qualification"],
      members.map((s, i) => [
        String(i + 1),
        s.fullName,
        s.rank,
        s.specialization || "—",
        s.qualification,
      ]),
      colWidths,
    );
  }
}

function generatePhilosophySection(
  doc: InstanceType<typeof PDFDocument>,
  prog: BulletinProgramme,
) {
  const c = prog.content;
  sectionHeading(doc, "2. Programme Philosophy & Objectives");

  if (c?.philosophy) {
    subHeading(doc, "Philosophy");
    bodyText(doc, c.philosophy);
  }
  if (c?.mission) {
    subHeading(doc, "Mission");
    bodyText(doc, c.mission);
  }
  if (c?.vision) {
    subHeading(doc, "Vision");
    bodyText(doc, c.vision);
  }
  if (c?.objectives && c.objectives.length > 0) {
    subHeading(doc, "Programme Objectives");
    c.objectives.forEach((obj, i) => {
      bodyText(doc, `${i + 1}. ${obj}`);
    });
  }
  if (c?.uniqueFeatures && c.uniqueFeatures.length > 0) {
    subHeading(doc, "Unique Features");
    c.uniqueFeatures.forEach((f) => bodyText(doc, `• ${f}`));
  }
  if (c?.employability) {
    subHeading(doc, "Employability Skills");
    bodyText(doc, c.employability);
  }
  if (c?.centurySkills && c.centurySkills.length > 0) {
    subHeading(doc, "21st Century Skills");
    c.centurySkills.forEach((s) => bodyText(doc, `• ${s}`));
  }
}

function generateAdmissionSection(
  doc: InstanceType<typeof PDFDocument>,
  prog: BulletinProgramme,
) {
  const c = prog.content;
  sectionHeading(doc, "3. Admission & Graduation Requirements");

  if (c?.utmeRequirements) {
    subHeading(doc, "UTME Entry Requirements");
    bodyText(doc, c.utmeRequirements);
  }
  if (c?.directEntryRequirements) {
    subHeading(doc, "Direct Entry Requirements");
    bodyText(doc, c.directEntryRequirements);
  }
  if (c?.transferRequirements) {
    subHeading(doc, "Inter-University Transfer Requirements");
    bodyText(doc, c.transferRequirements);
  }
  if (c?.minimumDuration) {
    subHeading(doc, "Programme Duration");
    bodyText(doc, `Minimum Duration: ${c.minimumDuration} years`);
  }
  if (c?.graduationRequirements) {
    subHeading(doc, "Graduation Requirements");
    bodyText(doc, c.graduationRequirements);
  }
  if (c?.minimumCGPA) {
    boldText(doc, `Minimum CGPA: ${c.minimumCGPA}`);
  }
  if (c?.totalUnits) {
    boldText(doc, `Total Required Units: ${c.totalUnits}`);
  }
}

function generateCourseStructureSection(
  doc: InstanceType<typeof PDFDocument>,
  courses: BulletinCourse[],
) {
  sectionHeading(doc, "4. Programme Course Structure");

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
  const colWidths = [
    CONTENT_WIDTH * 0.15,
    CONTENT_WIDTH * 0.45,
    CONTENT_WIDTH * 0.15,
    CONTENT_WIDTH * 0.1,
    CONTENT_WIDTH * 0.15,
  ];

  for (const level of levels) {
    subHeading(doc, `${level} Level`);
    const semesters = Object.keys(grouped[level])
      .map(Number)
      .sort((a, b) => a - b);

    for (const semester of semesters) {
      const semCourses = grouped[level][semester];
      boldText(doc, `${semester === 1 ? "First" : "Second"} Semester`);

      const totalUnits = semCourses.reduce((sum, c) => sum + c.units, 0);

      drawTable(
        doc,
        ["Code", "Title", "Status", "Units", "Prerequisites"],
        [
          ...semCourses.map((c) => [
            c.code,
            c.title,
            c.status,
            String(c.units),
            c.prerequisites || "—",
          ]),
          ["", "Total", "", String(totalUnits), ""],
        ],
        colWidths,
      );
    }
  }
}

function generateCourseDescriptionsSection(
  doc: InstanceType<typeof PDFDocument>,
  courses: BulletinCourse[],
) {
  sectionHeading(doc, "5. Course Descriptions");

  const coursesWithDesc = courses.filter((c) => c.description);

  if (coursesWithDesc.length === 0) {
    doc
      .fontSize(10)
      .font("Helvetica-Oblique")
      .text("No course descriptions available.");
    return;
  }

  for (const course of coursesWithDesc) {
    const desc = course.description!;
    ensureSpace(doc, 80);

    subHeading(doc, `${course.code}: ${course.title} (${course.units} Units)`);

    if (desc.learningOutcomes && desc.learningOutcomes.length > 0) {
      boldText(doc, "Learning Outcomes:");
      desc.learningOutcomes.forEach((outcome, i) => {
        bodyText(doc, `${i + 1}. ${outcome}`);
      });
    }
    if (desc.courseContent) {
      boldText(doc, "Course Content:");
      bodyText(doc, stripHtml(desc.courseContent));
    }
    if (desc.labWork) {
      boldText(doc, "Lab/Practical Work:");
      bodyText(doc, stripHtml(desc.labWork));
    }
    if (desc.entrepreneurialAspect) {
      boldText(doc, "Entrepreneurial/Practical Aspect:");
      bodyText(doc, stripHtml(desc.entrepreneurialAspect));
    }

    doc.moveDown(0.5);
  }
}

function generateRegulationsSection(
  doc: InstanceType<typeof PDFDocument>,
  prog: BulletinProgramme,
) {
  const hasRegulations = !!prog.content?.sectionF?.content;
  const hasChanges = !!prog.content?.sectionG?.content;

  if (!hasRegulations && !hasChanges) return;

  sectionHeading(doc, "6. Regulations & Summary of Changes");

  if (hasRegulations) {
    subHeading(doc, "Programme Regulations");
    bodyText(doc, stripHtml(prog.content!.sectionF!.content));
  }
  if (hasChanges) {
    subHeading(doc, "Summary of Changes");
    bodyText(doc, stripHtml(prog.content!.sectionG!.content));
  }
}

// ── Main Export ──────────────────────────────────────────────────────────────

export async function generateBulletinPdf(data: BulletinData): Promise<Buffer> {
  if (data.programmes.length === 0)
    throw new Error("No programme data available for export");

  return new Promise((resolve, reject) => {
    const prog = data.programmes[0];
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      info: {
        Title: `${prog.name} - Academic Bulletin`,
        Author: prog.school,
      },
    });

    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    for (let i = 0; i < data.programmes.length; i++) {
      const p = data.programmes[i];
      if (i > 0) doc.addPage();
      generateTitlePage(doc, p);
      generateStaffSection(doc, p);
      generatePhilosophySection(doc, p);
      generateAdmissionSection(doc, p);
      generateCourseStructureSection(doc, p.courses);
      generateCourseDescriptionsSection(doc, p.courses);
      generateRegulationsSection(doc, p);
    }

    doc.end();
  });
}
