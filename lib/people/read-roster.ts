/**
 * Reads the roster workbook (the D1 template, ABRS_Roster_Template_D1.xlsx).
 * Node only. Columns are found by their heading, so their order may change.
 */
import ExcelJS from "exceljs";
import type { RosterRow, RosterSheet } from "@/lib/people/roster";

const SHEETS: { name: RosterSheet; unit: string | null; title: string; fullName: string; email: string; acting: string | null }[] = [
  { name: "Deans", unit: "School code", title: "Dean title", fullName: "Dean full name", email: "Dean email", acting: "Acting" },
  { name: "Heads of Department", unit: "Department code", title: "Head title", fullName: "Head full name", email: "Head email", acting: "Acting" },
  { name: "Programme coordinators", unit: "Programme code", title: "Coordinator title", fullName: "Coordinator full name", email: "Coordinator email", acting: null },
  { name: "DAP officers", unit: "School code", title: "Officer title", fullName: "Officer full name", email: "Officer email", acting: null },
  { name: "General Education desk", unit: null, title: "Title", fullName: "Full name", email: "Email", acting: null },
];

function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("").trim();
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text.trim(); // hyperlinks
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim(); // formulas
  return String(value).trim();
}

export async function readRosterWorkbook(path: string): Promise<RosterRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const rows: RosterRow[] = [];
  for (const spec of SHEETS) {
    const sheet = workbook.getWorksheet(spec.name);
    if (!sheet) throw new Error(`The roster has no "${spec.name}" sheet.`);
    // Array.from, not map: ExcelJS rows are sparse and map would keep the holes.
    const header = Array.from(sheet.getRow(1).values as ExcelJS.CellValue[], text);
    // Headings may carry a note, e.g. "Dean email (babcock.edu.ng)".
    const column = (heading: string | null) =>
      heading === null ? -1 : header.findIndex((cell) => cell.toLowerCase().startsWith(heading.toLowerCase()));
    const columns = {
      unit: column(spec.unit),
      title: column(spec.title),
      fullName: column(spec.fullName),
      email: column(spec.email),
      acting: column(spec.acting),
      whatsapp: column("WhatsApp"),
    };
    const required: [string | null, number][] = [
      [spec.unit, columns.unit],
      [spec.title, columns.title],
      [spec.fullName, columns.fullName],
      [spec.email, columns.email],
    ];
    for (const [heading, index] of required) {
      if (heading !== null && index < 0) throw new Error(`The "${spec.name}" sheet has no "${heading}" column.`);
    }
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values as ExcelJS.CellValue[];
      const cell = (index: number) => (index < 0 ? "" : text(values[index]));
      rows.push({
        sheet: spec.name,
        rowNumber,
        unitCode: cell(columns.unit),
        title: cell(columns.title),
        fullName: cell(columns.fullName),
        email: cell(columns.email),
        acting: cell(columns.acting),
        whatsapp: cell(columns.whatsapp),
      });
    });
  }
  return rows;
}
