import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { courseSemesterLabel, courseSemesterOrder } from "@/lib/courses/course-rules";
import { LEADER_ROLE_LABEL, leaderName } from "@/lib/leaders";
import { CREDIT_SUMMARY_HEADERS, OUTCOMES_LEAD, courseHeading, creditSummaryRows, graduationNumbersLine, programmeCreditSummary } from "@/lib/bulletin/course-layout";
import type {
  BulletinCourse,
  BulletinData,
  BulletinProgramme,
  BulletinStaff,
} from "./generation";
import {
  cleanText,
  departmentLabel,
  durationLabel,
  parseStructuredText,
} from "./document-utils";
import { validateBulletinData } from "./validation";
import { DEPARTMENT_STATEMENTS, UNIVERSITY_HEADING, sectionTitle, universityStatementsFor } from "@/lib/bulletin/page-order";
import { UNIVERSITY_ADMISSION, type AdmissionRoute } from "@/lib/bulletin/admission-wording";
import { loadPhoto } from "@/lib/storage";
import { formatDate } from "@/lib/dates/format";

const NAVY = "123B66";
const GOLD = "C99A2E";
const PALE_BLUE = "EEF4FA";
const LIGHT_BORDER = "CBD5E1";
const TEXT = "172033";
const WHITE = "FFFFFF";

type DocElement = Paragraph | Table;
type ImageType = "jpg" | "png" | "gif" | "bmp";
type EmbeddedImage = { data: Buffer; type: ImageType };

const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BORDER },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BORDER },
  left: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BORDER },
  right: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BORDER },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BORDER },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BORDER },
};

function heading(text: string, level: 1 | 2 | 3, pageBreakBefore = false) {
  const headingLevel = level === 1
    ? HeadingLevel.HEADING_1
    : level === 2
      ? HeadingLevel.HEADING_2
      : HeadingLevel.HEADING_3;
  return new Paragraph({
    heading: headingLevel,
    pageBreakBefore,
    keepNext: true,
    spacing: { before: level === 1 ? 200 : 140, after: level === 1 ? 140 : 80 },
    children: [new TextRun({ text: cleanText(text), bold: true })],
  });
}

function paragraph(
  text: string,
  options?: { bold?: boolean; italic?: boolean; after?: number; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType] },
) {
  return new Paragraph({
    alignment: options?.alignment,
    spacing: { after: options?.after ?? 100, line: 276 },
    children: [
      new TextRun({
        text: cleanText(text),
        bold: options?.bold,
        italics: options?.italic,
        color: TEXT,
      }),
    ],
  });
}

function listItem(text: string, index?: number) {
  return new Paragraph({
    indent: { left: 360, hanging: 260 },
    spacing: { after: 70, line: 276 },
    children: [
      new TextRun({ text: index ? `${index}. ` : "- ", bold: Boolean(index), color: TEXT }),
      new TextRun({ text: cleanText(text), color: TEXT }),
    ],
  });
}

function tableCell(
  text: string,
  width: number,
  options?: { header?: boolean; bold?: boolean; center?: boolean; shading?: string; children?: Paragraph[] },
) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    shading: options?.header || options?.shading
      ? {
          type: ShadingType.SOLID,
          color: options?.header ? NAVY : options.shading,
          fill: options?.header ? NAVY : options.shading,
        }
      : undefined,
    children: options?.children || [
      new Paragraph({
        alignment: options?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        spacing: { after: 0, line: 240 },
        children: [
          new TextRun({
            text: cleanText(text || "-"),
            bold: options?.header || options?.bold,
            color: options?.header ? WHITE : TEXT,
            size: 19,
          }),
        ],
      }),
    ],
  });
}

function docxTable(
  headers: string[],
  rows: string[][],
  widths: number[],
  options?: { firstColumnBold?: boolean; centeredColumns?: number[] },
) {
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map((value, index) =>
      tableCell(value, widths[index], {
        header: true,
        center: options?.centeredColumns?.includes(index),
      }),
    ),
  });
  const dataRows = rows.map(
    (row, rowIndex) =>
      new TableRow({
        cantSplit: true,
        children: row.map((value, index) =>
          tableCell(value, widths[index], {
            bold: options?.firstColumnBold && index === 0,
            center: options?.centeredColumns?.includes(index),
            shading: rowIndex % 2 ? PALE_BLUE : undefined,
          }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders,
    rows: [header, ...dataRows],
  });
}

async function fetchImage(url?: string): Promise<EmbeddedImage | null> {
  const photo = await loadPhoto(url);
  if (!photo) return null;
  const { contentType } = photo;
  const type: ImageType | null = /png/i.test(contentType)
    ? "png"
    : /jpe?g/i.test(contentType)
      ? "jpg"
      : /gif/i.test(contentType)
        ? "gif"
        : /bmp/i.test(contentType)
          ? "bmp"
          : null;
  if (!type) return null;
  return { data: photo.data, type };
}

async function loadStaffPhotos(data: BulletinData): Promise<Map<string, EmbeddedImage>> {
  const entries = await Promise.all(
    data.programmes.flatMap((programme) => [
      ...programme.staff.map(async (staff) => [staff.id, await fetchImage(staff.imageUrl)] as const),
      // E4 and Q4: the Dean's and Head's photos, keyed by programme.
      ...(["dean", "hod"] as const).map(
        async (role) => [`${role}:${programme.id}`, await fetchImage(programme.leaders?.[role].imageUrl ?? undefined)] as const,
      ),
    ]),
  );
  return new Map(
    entries.filter((entry): entry is readonly [string, EmbeddedImage] => Boolean(entry[1])),
  );
}

function coverPage(programme: BulletinProgramme, draft: boolean): Paragraph[] {
  const items = [
    new Paragraph({ spacing: { before: 1800, after: 200 } }),
    new Paragraph({
      style: "Title",
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: programme.school.toUpperCase(), bold: true, color: NAVY, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 260 },
      children: [new TextRun({ text: departmentLabel(programme.department), bold: true, color: NAVY, size: 27 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: programme.name, bold: true, color: TEXT, size: 42 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 420 },
      children: [new TextRun({ text: "ACADEMIC BULLETIN", bold: true, color: GOLD, size: 32 })],
    }),
  ];
  if (draft) {
    items.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        shading: { type: ShadingType.SOLID, color: PALE_BLUE, fill: PALE_BLUE },
        spacing: { before: 160, after: 200 },
        children: [new TextRun({ text: "DRAFT / INCOMPLETE PREVIEW", bold: true, color: NAVY, size: 22 })],
      }),
    );
  }
  items.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 700 },
      children: [
        new TextRun({
          text: `Generated ${formatDate(new Date())}`,
          color: "526173",
          size: 19,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  );
  return items;
}

function completenessNotice(messages: string[]): Paragraph[] {
  return [
    heading("Completeness Notice", 1),
    paragraph("This preview is not ready to be treated as a final bulletin.", { bold: true }),
    ...messages.map((message) => listItem(message)),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function staffTable(members: BulletinStaff[], photos: Map<string, EmbeddedImage>) {
  const widths = [10, 27, 18, 18, 27];
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: ["Photo", "Name", "Rank", "Qualification", "Specialization"].map((value, index) =>
      tableCell(value, widths[index], { header: true, center: index === 0 }),
    ),
  });
  const rows = members.map((member, rowIndex) => {
    const photo = photos.get(member.id);
    const photoChildren = photo
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 0 },
            children: [
              new ImageRun({
                data: photo.data,
                type: photo.type,
                transformation: { width: 42, height: 54 },
                altText: { title: member.fullName, description: `Portrait of ${member.fullName}`, name: member.fullName },
              }),
            ],
          }),
        ]
      : [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "-", color: TEXT })] })];
    const values = [member.fullName, member.rank, member.qualification, member.specialization || "-"];
    return new TableRow({
      cantSplit: true,
      children: [
        tableCell("", widths[0], { center: true, shading: rowIndex % 2 ? PALE_BLUE : undefined, children: photoChildren }),
        ...values.map((value, index) =>
          tableCell(value, widths[index + 1], { shading: rowIndex % 2 ? PALE_BLUE : undefined }),
        ),
      ],
    });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders,
    rows: [header, ...rows],
  });
}

/** Q4: the Dean's and Head's photos, with the title and full name under each. */
function leaderElements(programme: BulletinProgramme, photos: Map<string, EmbeddedImage>): DocElement[] {
  const elements: DocElement[] = [];
  for (const role of ["dean", "hod"] as const) {
    const leader = programme.leaders?.[role];
    const printed = leader ? leaderName(leader) : null;
    const photo = photos.get(`${role}:${programme.id}`);
    if (!photo && !printed) continue;
    if (photo) {
      elements.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 60 },
          children: [
            new ImageRun({
              data: photo.data,
              type: photo.type,
              transformation: { width: 96, height: 120 },
              altText: { title: printed ?? LEADER_ROLE_LABEL[role], description: `Portrait of the ${LEADER_ROLE_LABEL[role]}`, name: role },
            }),
          ],
        }),
      );
    }
    if (printed) elements.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [new TextRun({ text: printed, bold: true, color: NAVY })] }));
    elements.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: LEADER_ROLE_LABEL[role], color: TEXT })] }));
  }
  return elements;
}

function staffSection(programme: BulletinProgramme, photos: Map<string, EmbeddedImage>): DocElement[] {
  const elements: DocElement[] = [heading(sectionTitle("Staff Directory"), 1, true), ...leaderElements(programme, photos)];
  const groups = [
    ["Academic Staff", "ACADEMIC"],
    ["Adjunct Academic Staff", "ADJUNCT"],
    ["Non-Academic Staff", "NON_ACADEMIC"],
  ] as const;
  groups.forEach(([label, type]) => {
    const members = programme.staff.filter((staff) => staff.type === type);
    elements.push(heading(label, 2));
    elements.push(
      members.length
        ? staffTable(members, photos)
        : paragraph("No staff listed in this category.", { italic: true }),
    );
    elements.push(new Paragraph({ spacing: { after: 100 } }));
  });
  return elements;
}

function structuredElements(value?: string): DocElement[] {
  return parseStructuredText(value).map((block) => {
    if (block.type === "paragraph") return paragraph(block.text);
    const columns = Math.max(...block.rows.map((row) => row.length));
    const rows = block.rows.map((row) => [
      ...row,
      ...Array.from({ length: columns - row.length }, () => ""),
    ]);
    const width = 100 / columns;
    return docxTable(rows[0], rows.slice(1), Array.from({ length: columns }, () => width), {
      firstColumnBold: true,
      centeredColumns: Array.from({ length: Math.max(0, columns - 1) }, (_, index) => index + 1),
    });
  });
}

/** W14: the university's vision and mission open every programme page. */
function universitySection(data: BulletinData): DocElement[] {
  const statements = universityStatementsFor(data.university);
  if (!statements) return [];
  const elements: DocElement[] = [heading(UNIVERSITY_HEADING, 1, false)];
  if (statements.vision) elements.push(heading("Vision", 2), paragraph(statements.vision));
  if (statements.mission) elements.push(heading("Mission", 2), paragraph(statements.mission));
  return elements;
}

function overviewSection(programme: BulletinProgramme, pageBreak: boolean): DocElement[] {
  const content = programme.content;
  const elements: DocElement[] = [heading(sectionTitle("Programme Vision, Mission, Philosophy and Objectives"), 1, pageBreak)];
  // W14: the department's vision, mission and philosophy, in that order.
  DEPARTMENT_STATEMENTS.forEach(([label, key]) => {
    const value = content?.[key];
    if (value) elements.push(heading(label, 2), paragraph(value));
  });
  const lists: Array<[string, string[] | undefined]> = [
    ["Programme Objectives", content?.objectives],
    ["Unique Features", content?.uniqueFeatures],
    ["Employability Skills", content?.employability],
    ["21st Century Skills", content?.centurySkills],
  ];
  lists.forEach(([label, values]) => {
    if (!values?.length) return;
    elements.push(heading(label, 2));
    values.forEach((value, index) => elements.push(listItem(value, label === "Programme Objectives" ? index + 1 : undefined)));
  });
  return elements;
}

function admissionSection(programme: BulletinProgramme): DocElement[] {
  const content = programme.content;
  const elements: DocElement[] = [heading(sectionTitle("Admission and Graduation Requirements"), 1, true)];
  // W13: the university-wide wording first, then the programme's own.
  const fields: Array<[string, AdmissionRoute, string | undefined]> = [
    ["UTME Entry Requirements", "utme", content?.utmeRequirements],
    ["Direct Entry Requirements", "directEntry", content?.directEntryRequirements],
    ["Inter-University Transfer Requirements", "transfer", content?.transferRequirements],
  ];
  fields.forEach(([label, route, value]) => {
    elements.push(heading(label, 2), paragraph(UNIVERSITY_ADMISSION[route].text));
    if (value) elements.push(...structuredElements(value));
  });
  if (content?.minimumDuration) {
    elements.push(heading("Programme Duration", 2), paragraph(`Minimum Duration: ${durationLabel(content.minimumDuration)}`));
  }
  if (content?.graduationRequirements) {
    elements.push(heading("Graduation Requirements", 2), ...structuredElements(content.graduationRequirements));
  }

  // W4: the credit summary and W5: the graduation numbers, built by the app.
  const credits = programmeCreditSummary(programme);
  const numbersLine = graduationNumbersLine(credits);
  if (numbersLine) elements.push(paragraph(numbersLine));
  elements.push(heading("Credit Summary", 2));
  elements.push(docxTable(CREDIT_SUMMARY_HEADERS, creditSummaryRows(credits), [28, 18, 18, 18, 18], { firstColumnBold: true, centeredColumns: [1, 2, 3, 4] }));
  if (content?.minimumCGPA) elements.push(paragraph(`Minimum CGPA: ${content.minimumCGPA}`, { bold: true }));
  return elements;
}

function groupCourses(courses: BulletinCourse[]) {
  // Semester is null for a sessional course with no semester (B13).
  const grouped = new Map<number, Map<number | null, BulletinCourse[]>>();
  courses.forEach((course) => {
    if (!grouped.has(course.level)) grouped.set(course.level, new Map());
    const semesters = grouped.get(course.level)!;
    if (!semesters.has(course.semester)) semesters.set(course.semester, []);
    semesters.get(course.semester)!.push(course);
  });
  return grouped;
}

function courseStructureSection(programme: BulletinProgramme): DocElement[] {
  const elements: DocElement[] = [heading(sectionTitle("Programme Course Structure"), 1, true)];
  const grouped = groupCourses(programme.courses);
  if (grouped.size === 0) return [...elements, paragraph("No course structure has been provided.", { italic: true })];
  [...grouped.entries()].sort(([a], [b]) => a - b).forEach(([level, semesters]) => {
    elements.push(heading(`${level} Level`, 2));
    [...semesters.entries()].sort(([a], [b]) => courseSemesterOrder(a) - courseSemesterOrder(b)).forEach(([semester, courses]) => {
      elements.push(paragraph(courseSemesterLabel(semester), { bold: true }));
      const rows = courses.map((course) => [
        course.code,
        course.title,
        course.status.replaceAll("_", " "),
        String(course.units),
        course.prerequisites || "-",
      ]);
      rows.push(["", "Total", "", String(courses.reduce((sum, course) => sum + course.units, 0)), ""]);
      elements.push(docxTable(["Code", "Title", "Status", "Units", "Prerequisites"], rows, [15, 42, 16, 10, 17], { firstColumnBold: true, centeredColumns: [2, 3] }));
      elements.push(new Paragraph({ spacing: { after: 100 } }));
    });
  });
  return elements;
}

function courseDescriptionsSection(programme: BulletinProgramme): DocElement[] {
  const elements: DocElement[] = [heading(sectionTitle("Course Descriptions"), 1, true)];
  const courses = programme.courses.filter((course) => course.description);
  if (!courses.length) return [...elements, paragraph("No course descriptions are available.", { italic: true })];
  courses.forEach((course) => {
    const description = course.description!;
    // W15: the heading line, the lead-in, the outcomes, then the content.
    elements.push(heading(courseHeading(course), 2));
    if (description.learningOutcomes?.length) {
      elements.push(paragraph(OUTCOMES_LEAD, { bold: true }));
      description.learningOutcomes.forEach((outcome, index) => elements.push(listItem(outcome, index + 1)));
    }
    if (description.courseContent) elements.push(paragraph("Course Content", { bold: true }), ...structuredElements(description.courseContent));
    if (description.labWork) elements.push(paragraph("Lab or Practical Work", { bold: true }), ...structuredElements(description.labWork));
    if (description.entrepreneurialAspect) elements.push(paragraph("Entrepreneurial or Practical Aspect", { bold: true }), ...structuredElements(description.entrepreneurialAspect));
    elements.push(new Paragraph({ spacing: { after: 140 } }));
  });
  return elements;
}

function regulationsSection(programme: BulletinProgramme): DocElement[] {
  if (!programme.content?.sectionF?.content && !programme.content?.sectionG?.content) return [];
  const elements: DocElement[] = [heading(sectionTitle("Regulations and Summary of Changes"), 1, true)];
  if (programme.content.sectionF?.content) elements.push(heading("Programme Regulations", 2), ...structuredElements(programme.content.sectionF.content));
  if (programme.content.sectionG?.content) elements.push(heading("Summary of Changes", 2), ...structuredElements(programme.content.sectionG.content));
  return elements;
}

export async function generateBulletinDocx(data: BulletinData): Promise<Buffer> {
  if (data.programmes.length === 0) throw new Error("No programme data available for export");
  const issues = validateBulletinData(data);
  const photos = await loadStaffPhotos(data);
  const children: DocElement[] = [];

  data.programmes.forEach((programme, index) => {
    if (index > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    const programmeIssues = issues.filter((item) => item.programmeId === programme.id);
    const draft = programme.submissionStatus !== "APPROVED" || programmeIssues.length > 0;
    children.push(...coverPage(programme, draft));
    if (programmeIssues.length > 0) children.push(...completenessNotice(programmeIssues.map((item) => item.message)));
    // W14: the same order on every programme page.
    const university = universitySection(data);
    children.push(
      ...university,
      ...overviewSection(programme, university.length > 0),
      ...admissionSection(programme),
      ...courseStructureSection(programme),
      ...courseDescriptionsSection(programme),
      ...staffSection(programme, photos),
      ...regulationsSection(programme),
    );
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { size: 22, font: "Aptos", color: TEXT },
          paragraph: { spacing: { line: 276 } },
        },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Aptos Display", size: 36, bold: true, color: NAVY },
          paragraph: { spacing: { after: 240 }, alignment: AlignmentType.CENTER },
        },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Aptos Display", size: 30, bold: true, color: NAVY },
          paragraph: { spacing: { before: 200, after: 140 }, keepNext: true },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Aptos Display", size: 25, bold: true, color: NAVY },
          paragraph: { spacing: { before: 140, after: 80 }, keepNext: true },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { font: "Aptos", size: 22, bold: true, color: TEXT },
          paragraph: { spacing: { before: 120, after: 70 }, keepNext: true },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080, header: 540, footer: 540 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: "Babcock University Academic Bulletin", color: "5A6775", size: 16 })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", color: "5A6775", size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: "5A6775", size: 16 }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
