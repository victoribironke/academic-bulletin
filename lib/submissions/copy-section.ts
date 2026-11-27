/**
 * Task G8: a department with several programmes writes a section once and
 * copies it to its other programmes, then adjusts each. Only the words are
 * copied; programme-specific numbers (total units, minimum CGPA) and photos
 * are not.
 */
export const COPYABLE_SECTIONS: Record<string, { title: string; fields: string[] }> = {
  overview: {
    title: "Programme Overview",
    fields: ["philosophy", "mission", "vision", "objectives", "uniqueFeatures", "employability"],
  },
  admission: {
    title: "Admission Requirements",
    fields: ["utmeRequirements", "directEntryRequirements", "transferRequirements", "minimumDuration"],
  },
  graduation: { title: "Graduation Requirements", fields: ["graduationRequirements"] },
  regulations: { title: "Regulations & Changes", fields: ["sectionF", "sectionG"] },
};

/** Whether a stored value has anything in it (text, a list, or rich text). */
export function hasWords(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((item) => String(item ?? "").trim());
  if (typeof value === "object") return hasWords((value as { content?: unknown }).content);
  return String(value).replace(/<[^>]+>/g, "").trim().length > 0;
}
