export type SpreadsheetRecord = Record<string, unknown>;

export interface ValidatedImportRow<T> {
  rowNumber: number;
  raw: SpreadsheetRecord;
  data?: T;
  errors: string[];
}

export interface TemplateColumn {
  key: string;
  label: string;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function tabularRowsToRecords(rows: unknown[][]): SpreadsheetRecord[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((value) => String(value ?? "").trim());

  return rows.slice(1).flatMap((values) => {
    if (values.every((value) => String(value ?? "").trim() === "")) return [];
    const record: SpreadsheetRecord = {};
    headers.forEach((header, index) => {
      if (header) record[header] = values[index] ?? "";
    });
    return [record];
  });
}

export async function parseSpreadsheetFile(
  file: File,
): Promise<SpreadsheetRecord[]> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    return tabularRowsToRecords(parseCsvRows(await file.text()));
  }

  if (extension !== "xlsx") {
    throw new Error("Please select a CSV or Excel workbook (.csv or .xlsx).");
  }

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await file.arrayBuffer()) as never);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const values: unknown[] = [];
    const rawValues = excelRow.values as unknown[];
    for (let index = 1; index < rawValues.length; index += 1) {
      const cell = excelRow.getCell(index);
      values.push(cell.text || cell.value || "");
    }
    rows.push(values);
  });
  return tabularRowsToRecords(rows);
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadCsvTemplate(
  filename: string,
  columns: TemplateColumn[],
  exampleRows: unknown[][],
) {
  const rows = [
    columns.map((column) => column.label),
    ...exampleRows,
  ];
  const csv = rows
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function normalizeImportHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getImportValue(
  row: SpreadsheetRecord,
  aliases: string[],
): unknown {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeImportHeader(key), value]),
  );
  for (const alias of aliases) {
    const value = normalized.get(normalizeImportHeader(alias));
    if (value !== undefined) return value;
  }
  return undefined;
}

export function importText(value: unknown): string {
  return String(value ?? "").trim();
}

export function importBoolean(value: unknown, defaultValue = true): boolean {
  const text = importText(value).toLowerCase();
  if (!text) return defaultValue;
  return !["false", "no", "n", "0", "hidden"].includes(text);
}
