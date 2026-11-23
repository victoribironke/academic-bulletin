/**
 * Reads package file 02 (02_Programme_Course_Structures_48_programmes.xlsx),
 * sheet "All programmes": one row per course per programme. Node only.
 * Columns are found by their heading, so their order may change.
 */
import ExcelJS from "exceljs";
import type { StructureRow } from "@/lib/courses/course-structure";

const SHEET = "All programmes";
const HEADINGS = {
  programmeName: "programme",
  programmeCode: "programme code",
  level: "level",
  semester: "semester",
  code: "course code",
  title: "course title",
  units: "units",
  status: "status",
  option: "option",
} as const;

function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("").trim();
  if (typeof value === "object" && "text" in value && typeof value.text === "string") return value.text.trim();
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  return String(value).trim();
}

function whole(value: string): number | null {
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

export async function readStructureWorkbook(path: string): Promise<StructureRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.getWorksheet(SHEET);
  if (!sheet) throw new Error(`The workbook has no "${SHEET}" sheet.`);
  // Array.from, not map: ExcelJS rows are sparse and map would keep the holes.
  const header = Array.from(sheet.getRow(1).values as ExcelJS.CellValue[], (cell) => text(cell).toLowerCase());
  // "Status (C/E/R)" matches "status"; "Programme" must not match "Programme Code".
  const column = (heading: string) =>
    header.findIndex((cell) => cell === heading || cell.startsWith(`${heading} (`));
  const columns = Object.fromEntries(
    Object.entries(HEADINGS).map(([key, heading]) => [key, column(heading)]),
  ) as Record<keyof typeof HEADINGS, number>;
  const missing = Object.entries(columns)
    .filter(([key, index]) => index < 0 && key !== "option")
    .map(([key]) => HEADINGS[key as keyof typeof HEADINGS]);
  if (missing.length > 0) throw new Error(`The "${SHEET}" sheet has no column for: ${missing.join(", ")}.`);

  const rows: StructureRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = (index: number) => (index < 0 ? "" : text(row.getCell(index).value));
    const code = cell(columns.code);
    const programmeCode = cell(columns.programmeCode);
    if (!code && !programmeCode) return;
    rows.push({
      rowNumber,
      programmeCode: programmeCode.toUpperCase(),
      programmeName: cell(columns.programmeName),
      level: whole(cell(columns.level)),
      semester: whole(cell(columns.semester)),
      code,
      title: cell(columns.title),
      units: whole(cell(columns.units)),
      status: cell(columns.status),
      option: cell(columns.option) || null,
    });
  });
  return rows;
}
