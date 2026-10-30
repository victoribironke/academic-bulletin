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
  required?: boolean;
  options?: string[];
  guidance?: string;
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

export async function createExcelTemplateBuffer(
  columns: TemplateColumn[],
  exampleRows: unknown[][],
) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const uploadSheet = workbook.addWorksheet("Upload", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headerRow = uploadSheet.addRow(columns.map((column) => column.label));
  headerRow.height = 28;
  headerRow.eachCell((cell, columnNumber) => {
    const column = columns[columnNumber - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: column.required ? "FFB8860B" : "FF17365D" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  columns.forEach((column, index) => {
    const worksheetColumn = uploadSheet.getColumn(index + 1);
    worksheetColumn.width = Math.min(Math.max(column.label.length + 4, 16), 34);

    if (column.options?.length) {
      const optionList = column.options.join(",");
      for (let rowNumber = 2; rowNumber <= 501; rowNumber += 1) {
        uploadSheet.getCell(rowNumber, index + 1).dataValidation = {
          type: "list",
          allowBlank: !column.required,
          formulae: [`"${optionList}"`],
          showErrorMessage: true,
          errorTitle: "Invalid value",
          error: "Choose one of the values in the list.",
        };
      }
    }
  });
  uploadSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const instructionsSheet = workbook.addWorksheet("Instructions");
  instructionsSheet.getColumn(1).width = 30;
  instructionsSheet.getColumn(2).width = 85;
  instructionsSheet.addRow(["BULK UPLOAD TEMPLATE"]);
  instructionsSheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF17365D" } };
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(["How to use", "Enter records only on the Upload sheet, beginning on row 2."]);
  instructionsSheet.addRow(["Required fields", "Gold headers are required. Blue headers are optional."]);
  instructionsSheet.addRow(["Do not change headers", "Keep the first row and the worksheet names unchanged."]);
  instructionsSheet.addRow(["Examples", "The Examples sheet is for guidance only and will not be uploaded."]);
  instructionsSheet.addRow(["Maximum rows", "Up to 500 records can be uploaded at once."]);
  instructionsSheet.addRow([]);
  instructionsSheet.addRow(["Column", "Accepted values / guidance"]);
  instructionsSheet.getRow(instructionsSheet.rowCount).font = { bold: true };
  columns.forEach((column) => {
    const guidance = column.options?.length
      ? column.options.join(", ")
      : column.guidance || (column.required ? "Required" : "Optional");
    instructionsSheet.addRow([column.label, guidance]);
  });

  if (exampleRows.length > 0) {
    const exampleSheet = workbook.addWorksheet("Examples", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    const exampleHeader = exampleSheet.addRow(columns.map((column) => column.label));
    exampleHeader.font = { bold: true, color: { argb: "FFFFFFFF" } };
    exampleHeader.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF17365D" },
    };
    exampleRows.forEach((row) => exampleSheet.addRow(row));
    columns.forEach((column, index) => {
      exampleSheet.getColumn(index + 1).width = Math.min(Math.max(column.label.length + 4, 16), 34);
    });
  }

  return workbook.xlsx.writeBuffer();
}

export async function downloadSpreadsheetTemplate(
  filename: string,
  columns: TemplateColumn[],
  exampleRows: unknown[][],
) {
  if (!filename.toLowerCase().endsWith(".xlsx")) {
    downloadCsvTemplate(filename, columns, exampleRows);
    return;
  }

  const buffer = await createExcelTemplateBuffer(columns, exampleRows);
  const url = URL.createObjectURL(
    new Blob([buffer as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
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
