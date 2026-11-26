/**
 * Tasks E2 and E3 on the server: the 2023-2027 bulletin as frozen for this
 * cycle (data/bulletin/baseline-2023-2027.json), what a draft carries over
 * from it, which carried fields the Head hasn't touched yet (rule V18), and a
 * first draft of the Summary of Changes.
 */
import data from "@/data/bulletin/baseline-2023-2027.json";
import { CARRIED_FIELDS, carriedText, type CarriedField } from "@/lib/bulletin/carried-fields";
import { isGeneralEducationFamily } from "@/lib/courses/general-education";

export type BaselineCourse = {
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number | null;
  status: string;
  option?: string;
};

export type BaselineProgramme = {
  file: string | null;
  sha256: string | null;
  fields: Record<string, unknown>;
  courses: BaselineCourse[];
};

const PROGRAMMES = (data as unknown as { programmes: Record<string, BaselineProgramme> }).programmes;

export function baselineFor(programmeCode: string | null | undefined): BaselineProgramme | null {
  if (!programmeCode) return null;
  return PROGRAMMES[programmeCode.trim().toUpperCase()] ?? null;
}

/** The draft column each carried field is stored in. */
export function columnOf(key: string): string {
  return key === "regulations" ? "sectionF" : key;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A carried field's 2023-2027 value, in the shape the draft stores it. */
export function baselineValue(baseline: BaselineProgramme, key: string): unknown {
  const fields = baseline.fields;
  switch (key) {
    case "objectives":
    case "uniqueFeatures":
    case "centurySkills":
      return Array.isArray(fields[key]) && (fields[key] as unknown[]).length ? fields[key] : null;
    case "employability": {
      const value = fields.employability;
      // The draft keeps employability as one text, items joined with "; ".
      return Array.isArray(value) && value.length ? value.join("; ") : null;
    }
    case "minimumCGPA":
      return typeof fields.minimumCGPA === "number" ? fields.minimumCGPA : null;
    case "regulations": {
      const text = typeof fields.departmentalRequirements === "string" ? fields.departmentalRequirements : "";
      if (!text.trim()) return null;
      return { content: text.split(/\n{2,}/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("") };
    }
    default:
      return typeof fields[key] === "string" && (fields[key] as string).trim() ? fields[key] : null;
  }
}

type ContentRow = Record<string, unknown> | null | undefined;

export function draftValue(content: ContentRow, key: string): unknown {
  return content ? content[columnOf(key)] : null;
}

function textOf(field: CarriedField, value: unknown): string {
  return carriedText(field.kind, value);
}

/** What a draft takes from 2023-2027: only fields it has left empty. */
export function carryPlan(baseline: BaselineProgramme, content: ContentRow): { patch: Record<string, unknown>; carried: string[] } {
  const patch: Record<string, unknown> = {};
  const carried: string[] = [];
  for (const field of CARRIED_FIELDS) {
    const value = baselineValue(baseline, field.key);
    if (value === null) continue;
    if (textOf(field, draftValue(content, field.key))) continue;
    patch[columnOf(field.key)] = value;
    carried.push(field.key);
  }
  return { patch, carried };
}

/** The carried fields still exactly as 2023-2027 had them (V18). */
export function stillCarried(carried: string[], baseline: BaselineProgramme | null, content: ContentRow): string[] {
  if (!baseline) return [];
  return carried.filter((key) => {
    const field = CARRIED_FIELDS.find((item) => item.key === key);
    if (!field) return false;
    return textOf(field, draftValue(content, key)) === textOf(field, baselineValue(baseline, key));
  });
}

/** Each carried field: its 2023-2027 text, for the compare view. */
export function baselineTexts(baseline: BaselineProgramme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of CARRIED_FIELDS) {
    const text = textOf(field, baselineValue(baseline, field.key));
    if (text) out[field.key] = text;
  }
  return out;
}

type DraftCourse = { code: string; title: string; units: number; level: number; semester: number | null; status: string };

function list(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

/**
 * E3: a first draft of the Summary of Changes, from the differences between
 * the draft and 2023-2027: the programme text that changed, and the courses
 * added, removed or changed. General Education rows are the General
 * Education desk's (W1), so they are left out.
 */
export function summaryOfChanges(baseline: BaselineProgramme, content: ContentRow, courses: DraftCourse[]): string {
  const parts: string[] = [];
  const text: string[] = [];
  for (const field of CARRIED_FIELDS) {
    const before = textOf(field, baselineValue(baseline, field.key));
    const now = textOf(field, draftValue(content, field.key));
    if (before === now) continue;
    if (!before && now) text.push(`${field.label}: added.`);
    else if (before && !now) text.push(`${field.label}: removed.`);
    else text.push(`${field.label}: revised.`);
  }
  if (text.length) parts.push(`<p><strong>Programme text</strong></p>${list(text)}`);

  const own = <T extends { code: string }>(rows: T[]): T[] => rows.filter((row) => !isGeneralEducationFamily(row.code));
  const old = new Map(own(baseline.courses).map((course) => [course.code, course]));
  const current = new Map(own(courses).map((course) => [course.code, course]));
  const added = [...current.values()].filter((course) => !old.has(course.code)).sort((a, b) => a.level - b.level || a.code.localeCompare(b.code));
  const removed = [...old.values()].filter((course) => !current.has(course.code)).sort((a, b) => a.level - b.level || a.code.localeCompare(b.code));
  const changed: string[] = [];
  for (const course of current.values()) {
    const before = old.get(course.code);
    if (!before) continue;
    const notes: string[] = [];
    if (before.units !== course.units) notes.push(`units ${before.units} to ${course.units}`);
    if (before.level !== course.level) notes.push(`level ${before.level} to ${course.level}`);
    if ((before.semester ?? null) !== (course.semester ?? null)) notes.push(`semester ${before.semester ?? "sessional"} to ${course.semester ?? "sessional"}`);
    const wasElective = before.status === "E";
    const isElective = course.status === "ELECTIVE" || course.status === "E";
    if (wasElective !== isElective) notes.push(isElective ? "now an elective" : "now core");
    if (notes.length) changed.push(`${course.code} ${course.title}: ${notes.join(", ")}.`);
  }
  if (added.length) parts.push(`<p><strong>Courses added</strong></p>${list(added.map((course) => `${course.code} ${course.title} (${course.units} units, ${course.level} level).`))}`);
  if (removed.length) parts.push(`<p><strong>Courses removed</strong></p>${list(removed.map((course) => `${course.code} ${course.title}.`))}`);
  if (changed.length) parts.push(`<p><strong>Courses changed</strong></p>${list(changed.sort())}`);

  if (!parts.length) return "<p>No changes from the 2023-2027 bulletin so far.</p>";
  return `<p>Changes from the 2023-2027 bulletin. This is a first draft built from the differences: say why each change was made.</p>${parts.join("")}`;
}
