/**
 * Task G3: when two people edit the same field, the second is warned. The
 * page sends the value of each field it changed as it last saw it; if the
 * saved value has moved on since (someone else saved it) and the page would
 * overwrite it with something different, the save is refused with the
 * fields' names, and the person chooses to keep theirs or load the other.
 */
export const CONFLICT_FIELDS: Record<string, string> = {
  philosophy: "Philosophy",
  mission: "Mission",
  vision: "Vision",
  objectives: "Objectives",
  uniqueFeatures: "Unique Features",
  employability: "Employability Skills",
  utmeRequirements: "UTME Requirements",
  directEntryRequirements: "Direct Entry Requirements",
  transferRequirements: "Transfer Requirements",
  minimumDuration: "Minimum Duration",
  graduationRequirements: "Graduation Requirements",
  minimumCGPA: "Minimum CGPA",
  totalUnits: "Total Credit Units",
  sectionF: "Regulations",
  sectionG: "Summary of Changes",
};

/** One comparable string per field, whatever shape the page or the database uses. */
export function conflictValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean).join("\n");
  if (typeof value === "object") return conflictValue((value as { content?: unknown }).content ?? "");
  if (typeof value === "number") return String(value);
  // Employability is stored joined with "; " but sent as a list.
  return String(value).split(/\s*;\s*|\n/).map((item) => item.trim()).filter(Boolean).join("\n");
}

/** The page's snapshot of what it last saw, for every field it may change. */
export function conflictSnapshot(content: Record<string, unknown> | null | undefined): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const key of Object.keys(CONFLICT_FIELDS)) snapshot[key] = conflictValue(content?.[key]);
  return snapshot;
}

/** The fields this save changes, with the value the page last saw for each. */
export function changedSince(payload: Record<string, unknown>, snapshot: Record<string, string>): Record<string, string> {
  const previous: Record<string, string> = {};
  for (const key of Object.keys(CONFLICT_FIELDS)) {
    if (!(key in payload) || !(key in snapshot)) continue;
    if (conflictValue(payload[key]) !== snapshot[key]) previous[key] = snapshot[key];
  }
  return previous;
}

/** Fields someone else has changed since the page last saw them, and this save would overwrite. */
export function editConflicts(
  previous: Record<string, unknown> | null | undefined,
  saved: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>,
): string[] {
  if (!previous || typeof previous !== "object") return [];
  return Object.keys(previous)
    .filter((key) => key in CONFLICT_FIELDS)
    .filter((key) => {
      const now = conflictValue(saved?.[key]);
      return now !== String(previous[key] ?? "") && conflictValue(incoming[key]) !== now;
    });
}
