import PDFDocument from "pdfkit";
import type {
  BulletinCourse,
  BulletinData,
  BulletinProgramme,
  BulletinStaff,
} from "./generation";
import {
  departmentLabel,
  durationLabel,
  parseStructuredText,
  pdfSafeText,
} from "./document-utils";
import { validateBulletinData } from "./validation";

const MARGIN = 54;
const NAVY = "#123B66";
const GOLD = "#C99A2E";
const PALE_BLUE = "#EEF4FA";
const LIGHT_BORDER = "#CBD5E1";
const TEXT = "#172033";

type PdfDoc = InstanceType<typeof PDFDocument>;

function contentWidth(doc: PdfDoc): number {
  return doc.page.width - MARGIN * 2;
}

function resetX(doc: PdfDoc) {
  doc.x = MARGIN;
}

function ensureSpace(doc: PdfDoc, needed: number) {
  if (doc.y + needed > doc.page.height - MARGIN - 18) {
    doc.addPage();
    resetX(doc);
  }
}

function bodyText(doc: PdfDoc, value: string, options?: { bold?: boolean; italic?: boolean }) {
  const text = pdfSafeText(value);
  if (!text) return;
  resetX(doc);
  doc
    .fillColor(TEXT)
    .font(options?.bold ? "Helvetica-Bold" : options?.italic ? "Helvetica-Oblique" : "Helvetica")
    .fontSize(10.5)
    .text(text, MARGIN, doc.y, {
      width: contentWidth(doc),
      lineGap: 3,
      paragraphGap: 4,
    });
  doc.moveDown(0.35);
  resetX(doc);
}

function sectionHeading(doc: PdfDoc, value: string, newPage = true) {
  if (newPage && doc.y > MARGIN + 12) doc.addPage();
  ensureSpace(doc, 52);
  resetX(doc);
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(17)
    .text(pdfSafeText(value), MARGIN, doc.y, { width: contentWidth(doc) });
  doc
    .moveTo(MARGIN, doc.y + 6)
    .lineTo(MARGIN + 56, doc.y + 6)
    .lineWidth(2)
    .strokeColor(GOLD)
    .stroke();
  doc.y += 16;
  resetX(doc);
}

function subHeading(doc: PdfDoc, value: string) {
  ensureSpace(doc, 34);
  resetX(doc);
  doc
    .fillColor(NAVY)
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .text(pdfSafeText(value), MARGIN, doc.y, { width: contentWidth(doc) });
  doc.moveDown(0.3);
  resetX(doc);
}

function drawTable(
  doc: PdfDoc,
  headers: string[],
  rows: string[][],
  widths: number[],
  options?: { fontSize?: number; firstColumnBold?: boolean },
) {
  const fontSize = options?.fontSize ?? 8.5;
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  const paddingX = 5;
  const paddingY = 5;

  const rowHeight = (cells: string[], isHeader = false) => {
    doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
    return Math.max(
      22,
      ...cells.map((cell, index) =>
        doc.heightOfString(pdfSafeText(cell || "-"), {
          width: widths[index] - paddingX * 2,
          lineGap: 1,
        }) + paddingY * 2,
      ),
    );
  };

  const drawRow = (cells: string[], header: boolean, rowIndex: number) => {
    const height = rowHeight(cells, header);
    let x = MARGIN;
    const y = doc.y;
    doc.rect(MARGIN, y, tableWidth, height).fill(header ? NAVY : rowIndex % 2 ? PALE_BLUE : "#FFFFFF");
    cells.forEach((cell, index) => {
      doc.rect(x, y, widths[index], height).lineWidth(0.6).strokeColor(LIGHT_BORDER).stroke();
      doc
        .fillColor(header ? "#FFFFFF" : TEXT)
        .font(header || (options?.firstColumnBold && index === 0) ? "Helvetica-Bold" : "Helvetica")
        .fontSize(fontSize)
        .text(pdfSafeText(cell || "-"), x + paddingX, y + paddingY, {
          width: widths[index] - paddingX * 2,
          height: height - paddingY * 2,
          lineGap: 1,
        });
      x += widths[index];
    });
    doc.y = y + height;
    resetX(doc);
  };

  const headerHeight = rowHeight(headers, true);
  ensureSpace(doc, headerHeight + 24);
  drawRow(headers, true, 0);
  rows.forEach((row, index) => {
    const height = rowHeight(row);
    if (doc.y + height > doc.page.height - MARGIN - 18) {
      doc.addPage();
      resetX(doc);
      drawRow(headers, true, 0);
    }
    drawRow(row, false, index);
  });
  doc.y += 12;
  resetX(doc);
}

async function fetchPhoto(url?: string): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const type = response.headers.get("content-type") || "";
    if (!response.ok || !/(png|jpe?g)/i.test(type)) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function loadStaffPhotos(data: BulletinData): Promise<Map<string, Buffer>> {
  const entries = await Promise.all(
    data.programmes.flatMap((programme) =>
      programme.staff.map(async (staff) => [staff.id, await fetchPhoto(staff.imageUrl)] as const),
    ),
  );
  return new Map(
    entries.filter((entry): entry is readonly [string, Buffer] => Boolean(entry[1])),
  );
}

function drawStaffTable(
  doc: PdfDoc,
  members: BulletinStaff[],
  photos: Map<string, Buffer>,
) {
  const widths = [48, 128, 92, 88, contentWidth(doc) - 356];
  const headers = ["Photo", "Name", "Rank", "Qualification", "Specialization"];

  const drawHeader = () => {
    let x = MARGIN;
    const y = doc.y;
    const height = 24;
    doc.rect(MARGIN, y, contentWidth(doc), height).fill(NAVY);
    headers.forEach((header, index) => {
      doc.rect(x, y, widths[index], height).lineWidth(0.6).strokeColor(LIGHT_BORDER).stroke();
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8.5).text(header, x + 4, y + 7, {
        width: widths[index] - 8,
      });
      x += widths[index];
    });
    doc.y = y + height;
    resetX(doc);
  };

  ensureSpace(doc, 86);
  drawHeader();
  members.forEach((member, index) => {
    const cells = [member.fullName, member.rank, member.qualification, member.specialization || "-"];
    doc.font("Helvetica").fontSize(8.5);
    const height = Math.max(
      58,
      ...cells.map((cell, cellIndex) =>
        doc.heightOfString(pdfSafeText(cell), { width: widths[cellIndex + 1] - 8 }) + 10,
      ),
    );
    if (doc.y + height > doc.page.height - MARGIN - 18) {
      doc.addPage();
      resetX(doc);
      drawHeader();
    }

    const y = doc.y;
    let x = MARGIN;
    doc.rect(MARGIN, y, contentWidth(doc), height).fill(index % 2 ? PALE_BLUE : "#FFFFFF");
    widths.forEach((width) => {
      doc.rect(x, y, width, height).lineWidth(0.6).strokeColor(LIGHT_BORDER).stroke();
      x += width;
    });

    const photo = photos.get(member.id);
    if (photo) {
      try {
        doc.image(photo, MARGIN + 7, y + 5, { fit: [34, height - 10], align: "center", valign: "center" });
      } catch {
        // Unsupported/corrupt photos are omitted without breaking the bulletin.
      }
    }
    x = MARGIN + widths[0];
    cells.forEach((cell, cellIndex) => {
      doc.fillColor(TEXT).font("Helvetica").fontSize(8.5).text(pdfSafeText(cell), x + 4, y + 6, {
        width: widths[cellIndex + 1] - 8,
        height: height - 12,
      });
      x += widths[cellIndex + 1];
    });
    doc.y = y + height;
    resetX(doc);
  });
  doc.y += 12;
}

function drawStructuredText(doc: PdfDoc, value?: string) {
  for (const block of parseStructuredText(value)) {
    if (block.type === "paragraph") {
      bodyText(doc, block.text);
      continue;
    }
    const columns = Math.max(...block.rows.map((row) => row.length));
    const rows = block.rows.map((row) => [
      ...row,
      ...Array.from({ length: columns - row.length }, () => ""),
    ]);
    const width = contentWidth(doc) / columns;
    drawTable(doc, rows[0], rows.slice(1), Array.from({ length: columns }, () => width), {
      fontSize: 8.5,
      firstColumnBold: true,
    });
  }
}

function drawCover(doc: PdfDoc, programme: BulletinProgramme, draft: boolean) {
  const width = doc.page.width;
  doc.rect(0, 0, width, 120).fill(NAVY);
  doc.rect(0, 120, width, 8).fill(GOLD);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(17).text(
    pdfSafeText(programme.school.toUpperCase()),
    MARGIN,
    52,
    { width: contentWidth(doc), align: "center" },
  );
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(14).text(
    pdfSafeText(departmentLabel(programme.department)),
    MARGIN,
    210,
    { width: contentWidth(doc), align: "center" },
  );
  doc.fontSize(25).text(pdfSafeText(programme.name), MARGIN, 270, {
    width: contentWidth(doc),
    align: "center",
  });
  doc.fillColor(GOLD).fontSize(18).text("ACADEMIC BULLETIN", MARGIN, 350, {
    width: contentWidth(doc),
    align: "center",
  });
  if (draft) {
    doc.roundedRect(MARGIN + 88, 430, contentWidth(doc) - 176, 42, 5).fill(PALE_BLUE);
    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(11).text(
      "DRAFT / INCOMPLETE PREVIEW",
      MARGIN + 88,
      445,
      { width: contentWidth(doc) - 176, align: "center" },
    );
  }
  doc.fillColor("#526173").font("Helvetica").fontSize(9.5).text(
    `Generated ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
    MARGIN,
    doc.page.height - 92,
    { width: contentWidth(doc), align: "center" },
  );
  doc.addPage();
  resetX(doc);
}

function drawStaffSection(
  doc: PdfDoc,
  programme: BulletinProgramme,
  photos: Map<string, Buffer>,
) {
  sectionHeading(doc, "1. Staff Directory", false);
  const groups = [
    ["Academic Staff", "ACADEMIC"],
    ["Adjunct Academic Staff", "ADJUNCT"],
    ["Non-Academic Staff", "NON_ACADEMIC"],
  ] as const;
  for (const [label, type] of groups) {
    const members = programme.staff.filter((staff) => staff.type === type);
    subHeading(doc, label);
    if (members.length === 0) bodyText(doc, "No staff listed in this category.", { italic: true });
    else drawStaffTable(doc, members, photos);
  }
}

function drawProgrammeOverview(doc: PdfDoc, programme: BulletinProgramme) {
  sectionHeading(doc, "2. Programme Philosophy and Objectives");
  const content = programme.content;
  const sections: Array<[string, string | undefined]> = [
    ["Philosophy", content?.philosophy],
    ["Mission", content?.mission],
    ["Vision", content?.vision],
  ];
  sections.forEach(([label, value]) => {
    if (!value) return;
    subHeading(doc, label);
    bodyText(doc, value);
  });
  const lists: Array<[string, string[] | undefined]> = [
    ["Programme Objectives", content?.objectives],
    ["Unique Features", content?.uniqueFeatures],
    ["Employability Skills", content?.employability],
    ["21st Century Skills", content?.centurySkills],
  ];
  lists.forEach(([label, values]) => {
    if (!values?.length) return;
    subHeading(doc, label);
    values.forEach((value, index) => bodyText(doc, `${label === "Programme Objectives" ? `${index + 1}.` : "-"} ${value}`));
  });
}

function drawAdmission(doc: PdfDoc, programme: BulletinProgramme) {
  sectionHeading(doc, "3. Admission and Graduation Requirements");
  const content = programme.content;
  const fields: Array<[string, string | undefined]> = [
    ["UTME Entry Requirements", content?.utmeRequirements],
    ["Direct Entry Requirements", content?.directEntryRequirements],
    ["Inter-University Transfer Requirements", content?.transferRequirements],
  ];
  fields.forEach(([label, value]) => {
    if (!value) return;
    subHeading(doc, label);
    drawStructuredText(doc, value);
  });
  if (content?.minimumDuration) {
    subHeading(doc, "Programme Duration");
    bodyText(doc, `Minimum Duration: ${durationLabel(content.minimumDuration)}`);
  }
  if (content?.graduationRequirements) {
    subHeading(doc, "Graduation Requirements");
    drawStructuredText(doc, content.graduationRequirements);
  }

  subHeading(doc, "Credit Requirements Summary");
  const levels = [...new Set(programme.courses.map((course) => course.level))].sort((a, b) => a - b);
  const rows = levels.map((level) => {
    const courses = programme.courses.filter((course) => course.level === level);
    const core = courses.filter((course) => ["CORE", "MANDATORY"].includes(course.status)).reduce((sum, course) => sum + course.units, 0);
    const elective = courses.filter((course) => course.status === "ELECTIVE").reduce((sum, course) => sum + course.units, 0);
    return [`${level} Level`, String(core), String(elective), String(core + elective)];
  });
  const coreTotal = programme.courses.filter((course) => ["CORE", "MANDATORY"].includes(course.status)).reduce((sum, course) => sum + course.units, 0);
  const electiveTotal = programme.courses.filter((course) => course.status === "ELECTIVE").reduce((sum, course) => sum + course.units, 0);
  rows.push(["Total Requirements", String(coreTotal), String(electiveTotal), String(coreTotal + electiveTotal)]);
  drawTable(doc, ["Level", "Core Units", "Elective Units", "Total"], rows, [150, 105, 105, contentWidth(doc) - 360], { firstColumnBold: true });
  if (content?.minimumCGPA) bodyText(doc, `Minimum CGPA: ${content.minimumCGPA}`, { bold: true });
  if (content?.totalUnits) bodyText(doc, `Total Expected Units: ${content.totalUnits}`, { bold: true });
}

function groupCourses(courses: BulletinCourse[]) {
  const grouped = new Map<number, Map<number, BulletinCourse[]>>();
  courses.forEach((course) => {
    if (!grouped.has(course.level)) grouped.set(course.level, new Map());
    const semesters = grouped.get(course.level)!;
    if (!semesters.has(course.semester)) semesters.set(course.semester, []);
    semesters.get(course.semester)!.push(course);
  });
  return grouped;
}

function drawCourseStructure(doc: PdfDoc, programme: BulletinProgramme) {
  sectionHeading(doc, "4. Programme Course Structure");
  const grouped = groupCourses(programme.courses);
  if (grouped.size === 0) {
    bodyText(doc, "No course structure has been provided.", { italic: true });
    return;
  }
  [...grouped.entries()].sort(([a], [b]) => a - b).forEach(([level, semesters]) => {
    subHeading(doc, `${level} Level`);
    [...semesters.entries()].sort(([a], [b]) => a - b).forEach(([semester, courses]) => {
      bodyText(doc, `${semester === 1 ? "First" : "Second"} Semester`, { bold: true });
      const rows = courses.map((course) => [
        course.code,
        course.title,
        course.status,
        String(course.units),
        course.prerequisites || "-",
      ]);
      rows.push(["", "Total", "", String(courses.reduce((sum, course) => sum + course.units, 0)), ""]);
      drawTable(doc, ["Code", "Title", "Status", "Units", "Prerequisites"], rows, [66, 210, 72, 48, contentWidth(doc) - 396], { firstColumnBold: true });
    });
  });
}

function drawCourseDescriptions(doc: PdfDoc, programme: BulletinProgramme) {
  sectionHeading(doc, "5. Course Descriptions");
  const courses = programme.courses.filter((course) => course.description);
  if (courses.length === 0) {
    bodyText(doc, "No course descriptions are available.", { italic: true });
    return;
  }
  courses.forEach((course) => {
    ensureSpace(doc, 110);
    subHeading(doc, `${course.code}: ${course.title} (${course.units} Units)`);
    const description = course.description!;
    if (description.learningOutcomes?.length) {
      bodyText(doc, "Learning Outcomes", { bold: true });
      description.learningOutcomes.forEach((outcome, index) => bodyText(doc, `${index + 1}. ${outcome}`));
    }
    if (description.courseContent) {
      bodyText(doc, "Course Content", { bold: true });
      drawStructuredText(doc, description.courseContent);
    }
    if (description.labWork) {
      bodyText(doc, "Lab or Practical Work", { bold: true });
      drawStructuredText(doc, description.labWork);
    }
    if (description.entrepreneurialAspect) {
      bodyText(doc, "Entrepreneurial or Practical Aspect", { bold: true });
      drawStructuredText(doc, description.entrepreneurialAspect);
    }
    doc.y += 8;
  });
}

function drawRegulations(doc: PdfDoc, programme: BulletinProgramme) {
  if (!programme.content?.sectionF?.content && !programme.content?.sectionG?.content) return;
  sectionHeading(doc, "6. Regulations and Summary of Changes");
  if (programme.content.sectionF?.content) {
    subHeading(doc, "Programme Regulations");
    drawStructuredText(doc, programme.content.sectionF.content);
  }
  if (programme.content.sectionG?.content) {
    subHeading(doc, "Summary of Changes");
    drawStructuredText(doc, programme.content.sectionG.content);
  }
}

function addHeadersAndFooters(doc: PdfDoc) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index++) {
    doc.switchToPage(index);
    if (index > 0) {
      doc.fillColor("#5A6775").font("Helvetica").fontSize(8).text(
        "Babcock University Academic Bulletin",
        MARGIN,
        24,
        { width: contentWidth(doc), align: "left", lineBreak: false },
      );
    }
    // PDFKit normally treats the footer area as outside the writable page
    // and silently adds another page when text is placed there. Temporarily
    // remove the bottom margin while drawing the footer so the footer stays
    // on the page being numbered.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor("#5A6775").font("Helvetica").fontSize(8).text(
      `Page ${index + 1}`,
      MARGIN,
      doc.page.height - 34,
      { width: contentWidth(doc), align: "center", lineBreak: false },
    );
    doc.page.margins.bottom = bottomMargin;
  }
}

export async function generateBulletinPdf(data: BulletinData): Promise<Buffer> {
  if (data.programmes.length === 0) throw new Error("No programme data available for export");

  const first = data.programmes[0];
  const issues = validateBulletinData(data);
  const photos = await loadStaffPhotos(data);
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: `${first.name} - Academic Bulletin`, Author: first.school },
  });
  const chunks: Uint8Array[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  data.programmes.forEach((programme, index) => {
    if (index > 0) doc.addPage();
    const programmeIssues = issues.filter((item) => item.programmeId === programme.id);
    const draft = programme.submissionStatus !== "APPROVED" || programmeIssues.length > 0;
    drawCover(doc, programme, draft);
    if (programmeIssues.length > 0) {
      sectionHeading(doc, "Completeness Notice", false);
      bodyText(doc, "This preview is not ready to be treated as a final bulletin.", { bold: true });
      programmeIssues.forEach((item) => bodyText(doc, `- ${item.message}`));
      doc.addPage();
    }
    drawStaffSection(doc, programme, photos);
    drawProgrammeOverview(doc, programme);
    drawAdmission(doc, programme);
    drawCourseStructure(doc, programme);
    drawCourseDescriptions(doc, programme);
    drawRegulations(doc, programme);
  });

  addHeadersAndFooters(doc);
  doc.end();
  return completed;
}
