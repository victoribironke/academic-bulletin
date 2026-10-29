import type { BulletinProgramme } from "./generation";

export type StructuredTextBlock =
  | { type: "paragraph"; text: string }
  | { type: "table"; rows: string[][] };

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

export function cleanText(value?: string): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>?/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) =>
      HTML_ENTITIES[entity] ?? entity,
    )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \u00a0]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** PDFKit's built-in fonts are most reliable with Windows-1252 punctuation. */
export function pdfSafeText(value?: string): string {
  return cleanText(value)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...");
}

export function departmentLabel(name: string): string {
  const trimmed = name.trim();
  return /^department\s+of\s+/i.test(trimmed)
    ? trimmed
    : `Department of ${trimmed}`;
}

export function durationLabel(duration: string): string {
  const trimmed = duration.trim();
  return /\byears?\b/i.test(trimmed) ? trimmed : `${trimmed} years`;
}

export function parseStructuredText(value?: string): StructuredTextBlock[] {
  const text = cleanText(value);
  if (!text) return [];

  const lines = text.split("\n");
  const blocks: StructuredTextBlock[] = [];
  let paragraphLines: string[] = [];
  let tableRows: string[][] = [];

  const flushParagraph = () => {
    const paragraph = paragraphLines.join("\n").trim();
    if (paragraph) blocks.push({ type: "paragraph", text: paragraph });
    paragraphLines = [];
  };
  const flushTable = () => {
    if (tableRows.length > 0) blocks.push({ type: "table", rows: tableRows });
    tableRows = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushTable();
      continue;
    }

    const cells = rawLine
      .split(/\t+/)
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (cells.length >= 2) {
      flushParagraph();
      tableRows.push(cells);
      continue;
    }

    flushTable();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushTable();
  return blocks;
}

export function programmeCourseUnits(programme: BulletinProgramme): number {
  return programme.courses.reduce((total, course) => total + course.units, 0);
}
