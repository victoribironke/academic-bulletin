/**
 * Task H4: help under each field. One line on what good looks like, a target
 * length with a live counter, and "See an example" from a strong 2023-2027
 * programme DAP chooses (data/help/field-examples.json; hidden until DAP
 * picks one). The targets are starting points DAP can change here.
 */
import examples from "@/data/help/field-examples.json";

export type FieldKey =
  | "vision"
  | "mission"
  | "philosophy"
  | "objectives"
  | "uniqueFeatures"
  | "employability"
  | "utmeRequirements"
  | "directEntryRequirements"
  | "transferRequirements"
  | "graduationRequirements"
  | "regulations"
  | "summaryOfChanges"
  | "learningOutcomes"
  | "courseContent";

export type LengthTarget = { unit: "words" | "items"; min: number; max: number };
export type FieldHelpEntry = { good: string; target: LengthTarget };
export type FieldExample = { programme: string; text: string };

export const FIELD_HELP: Record<FieldKey, FieldHelpEntry> = {
  vision: { good: "One sentence on what the programme aims to become, in plain words.", target: { unit: "words", min: 15, max: 40 } },
  mission: { good: "How the programme pursues its vision: whom it serves and what it gives them.", target: { unit: "words", min: 20, max: 60 } },
  philosophy: {
    good: "Why the programme exists and the beliefs that shape it, in keeping with Babcock's Christian ethos.",
    target: { unit: "words", min: 150, max: 250 },
  },
  objectives: { good: "What graduates will be able to do; start each with an action verb.", target: { unit: "items", min: 4, max: 8 } },
  uniqueFeatures: { good: "What sets this programme apart at Babcock, one feature per line.", target: { unit: "items", min: 2, max: 6 } },
  employability: { good: "The skills employers will value, as short phrases.", target: { unit: "items", min: 3, max: 8 } },
  utmeRequirements: {
    good: "The subjects for the five O-level credits beyond the university's rule, and the UTME subject combination.",
    target: { unit: "words", min: 20, max: 120 },
  },
  directEntryRequirements: { good: "The A-level or diploma qualifications accepted, and the level students join.", target: { unit: "words", min: 20, max: 120 } },
  transferRequirements: { good: "Who can transfer in, the minimum grade, and how many credits carry over.", target: { unit: "words", min: 20, max: 120 } },
  graduationRequirements: {
    good: "The total units, the minimum CGPA, and any project, practical or industrial training needed to graduate.",
    target: { unit: "words", min: 40, max: 200 },
  },
  regulations: {
    good: "Rules for this programme beyond the Academic Policy: assessment, probation, practical or clinical requirements.",
    target: { unit: "words", min: 50, max: 400 },
  },
  summaryOfChanges: { good: "What changed since the 2023-2027 bulletin, and why.", target: { unit: "words", min: 30, max: 300 } },
  learningOutcomes: {
    good: "What a student can do after the course, one action verb each; at least three.",
    target: { unit: "items", min: 3, max: 8 },
  },
  courseContent: { good: "The topics the course covers, in the order they are taught.", target: { unit: "words", min: 40, max: 150 } },
};

/** Words in text that may hold HTML (the rich text fields). */
export function wordCount(value: string): number {
  const text = value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&[a-z]+;/gi, " ").trim();
  return text ? text.split(/\s+/).length : 0;
}

export function measure(value: string | string[] | null | undefined, unit: LengthTarget["unit"]): number {
  if (Array.isArray(value)) {
    const items = value.filter((item) => item.trim());
    return unit === "items" ? items.length : items.reduce((sum, item) => sum + wordCount(item), 0);
  }
  const text = value ?? "";
  return unit === "items" ? text.split("\n").filter((line) => line.trim()).length : wordCount(text);
}

export type LengthStatus = "empty" | "short" | "good" | "long";

export function lengthStatus(count: number, target: LengthTarget): LengthStatus {
  if (count === 0) return "empty";
  if (count < target.min) return "short";
  return count > target.max ? "long" : "good";
}

/** "42 words · aim for 15 to 40". */
export function lengthLine(count: number, target: LengthTarget): string {
  const noun = target.unit === "words" ? (count === 1 ? "word" : "words") : count === 1 ? "item" : "items";
  return `${count} ${noun} · aim for ${target.min} to ${target.max}`;
}

export function fieldExample(field: FieldKey): FieldExample | null {
  const entry = (examples as Record<string, unknown>)[field];
  if (!entry || typeof entry !== "object") return null;
  const { programme, text } = entry as Record<string, unknown>;
  return typeof programme === "string" && typeof text === "string" && text.trim() ? { programme, text } : null;
}
