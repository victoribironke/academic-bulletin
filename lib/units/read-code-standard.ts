/**
 * Reads the code and name standard from package file 10
 * (10_Code_Standard_Schools_Departments_Programmes.xlsx). Node only.
 */
import ExcelJS from "exceljs";
import type { CodeStandard } from "@/lib/units/code-standard";

type Cell = string | null;

function text(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("").trim() || null;
  }
  const result = String(value).trim();
  return result || null;
}

function rowsOf(workbook: ExcelJS.Workbook, name: string): Record<string, Cell>[] {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) throw new Error(`File 10 has no "${name}" sheet.`);
  const rows: Cell[][] = [];
  sheet.eachRow((row) => rows.push((row.values as ExcelJS.CellValue[]).slice(1).map(text)));
  const [header, ...body] = rows;
  return body
    .filter((row) => row.some(Boolean))
    .map((row) => Object.fromEntries(header.map((key, index) => [key ?? `column${index}`, row[index] ?? null])));
}

function required(row: Record<string, Cell>, key: string, sheet: string): string {
  const value = row[key];
  if (!value) throw new Error(`File 10, sheet "${sheet}": a row has no "${key}".`);
  return value;
}

export async function readCodeStandard(path: string): Promise<CodeStandard> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  const schools = rowsOf(workbook, "Schools").map((row) => ({
    oldCode: row["Old code"],
    code: required(row, "New code", "Schools"),
    name: required(row, "Official name", "Schools"),
    reserved: /reserved/i.test(row["Status"] ?? ""),
  }));
  const departments = rowsOf(workbook, "Departments").map((row) => {
    // Some names were worked out from their programmes and carry
    // "(name to confirm)": DAP checks them against the official list.
    const listed = required(row, "Department", "Departments");
    const nameToConfirm = /\(name to confirm\)/i.test(listed);
    return {
      oldCode: row["Old department code"],
      code: required(row, "Full new code", "Departments"),
      schoolCode: required(row, "School (new)", "Departments"),
      name: listed.replace(/\s*\(name to confirm\)\s*/i, " ").trim(),
      nameToConfirm,
    };
  });
  const programmes = rowsOf(workbook, "Programmes").map((row) => {
    const code = required(row, "New full code", "Programmes");
    return {
      oldCode: row["Old full code"],
      code,
      departmentCode: code.split("-").slice(0, 2).join("-"),
      officialName: required(row, "Official name", "Programmes"),
      isNewProgramme: /^new\b/i.test(row["Status"] ?? ""),
    };
  });
  const ownershipMoves = rowsOf(workbook, "Course ownership moves").map((row) => ({
    prefix: required(row, "Course codes starting with", "Course ownership moves"),
    departmentCode: required(row, "New owner department code", "Course ownership moves"),
    schoolCode: required(row, "New owner school code", "Course ownership moves"),
  }));

  return { schools, departments, programmes, ownershipMoves };
}
