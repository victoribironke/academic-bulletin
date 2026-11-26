/**
 * Tasks E2 and E3: the draft fields that start from the 2023-2027 bulletin.
 * A carried field shows "From the 2023-2027 bulletin: please review" until
 * the Head of Department edits it or marks it reviewed (rule V18), and each
 * has a "Compare with 2023-2027" view. Safe for the browser: no data here.
 */

export type CarriedKind = "text" | "list" | "number" | "html";

export type CarriedField = {
  key: string;
  label: string;
  /** The draft section it sits in (section marks, V18 per section). */
  section: "overview" | "admission" | "graduation" | "regulations";
  kind: CarriedKind;
};

export const CARRIED_FIELDS: CarriedField[] = [
  { key: "vision", label: "Vision", section: "overview", kind: "text" },
  { key: "mission", label: "Mission", section: "overview", kind: "text" },
  { key: "philosophy", label: "Philosophy", section: "overview", kind: "text" },
  { key: "objectives", label: "Objectives", section: "overview", kind: "list" },
  { key: "uniqueFeatures", label: "Unique features", section: "overview", kind: "list" },
  { key: "employability", label: "Employability skills", section: "overview", kind: "list" },
  { key: "utmeRequirements", label: "UTME admission", section: "admission", kind: "text" },
  { key: "directEntryRequirements", label: "Direct Entry admission", section: "admission", kind: "text" },
  { key: "transferRequirements", label: "Transfer admission", section: "admission", kind: "text" },
  { key: "graduationRequirements", label: "Graduation requirements", section: "graduation", kind: "text" },
  { key: "regulations", label: "Programme regulations", section: "regulations", kind: "html" },
];

export const CARRIED_NOTE = "From the 2023-2027 bulletin: please review";

export function carriedField(key: string): CarriedField | undefined {
  return CARRIED_FIELDS.find((field) => field.key === key);
}

function stripHtml(value: string): string {
  return value
    .replace(/<\/(p|li|div|h\d)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** A value as text, so a field can be compared with its 2023-2027 version. */
export function carriedText(kind: CarriedKind, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (kind === "number") return typeof value === "number" || typeof value === "string" ? String(Number(value)) : "";
  if (kind === "list") {
    const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n|;\s+/) : [];
    return items
      .map((item) => String(item).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  }
  const text = kind === "html" && typeof value === "object" && value && "content" in value ? String((value as { content?: unknown }).content ?? "") : String(value);
  return (kind === "html" ? stripHtml(text) : text)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Words added and removed between two texts, for the compare view. */
export type DiffPart = { text: string; change: "same" | "added" | "removed" };

export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter((part) => part.length > 0);
  const b = after.split(/(\s+)/).filter((part) => part.length > 0);
  // Long texts: compare line by line so the table stays small.
  if (a.length * b.length > 4_000_000) {
    return [
      ...(before ? [{ text: before, change: "removed" as const }] : []),
      ...(after ? [{ text: after, change: "added" as const }] : []),
    ];
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (text: string, change: DiffPart["change"]) => {
    const last = parts[parts.length - 1];
    if (last && last.change === change) last.text += text;
    else parts.push({ text, change });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(a[i], "same");
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      push(a[i], "removed");
      i += 1;
    } else {
      push(b[j], "added");
      j += 1;
    }
  }
  while (i < a.length) push(a[i++], "removed");
  while (j < b.length) push(b[j++], "added");
  return parts;
}

const SECTION_ISSUE: Record<CarriedField["section"], string> = {
  overview: "CARRIED_OVERVIEW",
  admission: "CARRIED_ADMISSION",
  graduation: "CARRIED_GRADUATION",
  regulations: "CARRIED_REGULATIONS",
};

/** Rule V18: one Submit issue per section with carried text not yet reviewed. */
export function carriedIssues(carried: string[]): { code: string; message: string }[] {
  const bySection = new Map<string, string[]>();
  for (const key of carried) {
    const field = carriedField(key);
    if (!field) continue;
    bySection.set(field.section, [...(bySection.get(field.section) ?? []), field.label]);
  }
  return [...bySection.entries()].map(([section, labels]) => ({
    code: SECTION_ISSUE[section as CarriedField["section"]],
    message: `Review the text carried over from the 2023-2027 bulletin (${labels.join(", ")}): edit it, or mark it reviewed.`,
  }));
}
