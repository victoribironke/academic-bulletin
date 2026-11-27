/**
 * Task K5: the Course Registry's filters, with the count of courses next to
 * each choice. Each facet's counts apply every other filter but its own, so
 * a person sees how many courses each choice would show. Browser-safe.
 */
import { COURSE_TYPE_LABELS, OWNERSHIP_LABELS } from "@/lib/plain-words";

export type RegistryRow = {
  id: string;
  level: number;
  semester: number | null;
  type: string;
  ownership: string;
  school: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  programmes: { id: string; name: string }[];
  source: string | null;
  hasDescription: boolean;
  /** CHECKED: the current text has a GRACE result; NO_TEXT: nothing to check yet. */
  grace: "CHECKED" | "NOT_CHECKED" | "NO_TEXT";
};

export const FACET_KEYS = ["level", "semester", "school", "department", "programme", "type", "ownership", "source", "described", "grace"] as const;
export type FacetKey = (typeof FACET_KEYS)[number];
export type RegistryFilters = Partial<Record<FacetKey, string>>;

export const FACET_LABELS: Record<FacetKey, string> = {
  level: "Level",
  semester: "Semester",
  school: "School",
  department: "Department",
  programme: "Programme",
  type: "Course type",
  ownership: "Owner",
  source: "Source",
  described: "Description",
  grace: "GRACE",
};

/** The value(s) a row has for a facet; a course can serve several programmes. */
function valuesOf(row: RegistryRow, key: FacetKey): { value: string; label: string }[] {
  switch (key) {
    case "level":
      return [{ value: String(row.level), label: `${row.level} level` }];
    case "semester":
      return [row.semester === null ? { value: "sessional", label: "Sessional" } : { value: String(row.semester), label: row.semester === 1 ? "First" : "Second" }];
    case "school":
      return [row.school ? { value: row.school.id, label: row.school.name } : { value: "none", label: "University-wide" }];
    case "department":
      return [row.department ? { value: row.department.id, label: row.department.name } : { value: "none", label: "No department" }];
    case "programme":
      return row.programmes.length ? row.programmes.map((item) => ({ value: item.id, label: item.name })) : [{ value: "none", label: "Not in a programme" }];
    case "type":
      return [{ value: row.type, label: COURSE_TYPE_LABELS[row.type as keyof typeof COURSE_TYPE_LABELS] ?? row.type }];
    case "ownership":
      return [{ value: row.ownership, label: OWNERSHIP_LABELS[row.ownership as keyof typeof OWNERSHIP_LABELS] ?? row.ownership }];
    case "source":
      return [row.source ? { value: row.source, label: row.source } : { value: "none", label: "Not recorded" }];
    case "described":
      return [row.hasDescription ? { value: "yes", label: "Has a description" } : { value: "no", label: "No description yet" }];
    case "grace":
      return [
        row.grace === "CHECKED"
          ? { value: "checked", label: "GRACE checked" }
          : row.grace === "NOT_CHECKED"
            ? { value: "not", label: "Not checked yet" }
            : { value: "notext", label: "No text to check" },
      ];
  }
}

export function matchesFilters(row: RegistryRow, filters: RegistryFilters, except?: FacetKey): boolean {
  return FACET_KEYS.every((key) => {
    if (key === except) return true;
    const wanted = filters[key];
    if (!wanted || wanted === "all") return true;
    return valuesOf(row, key).some((item) => item.value === wanted);
  });
}

export type FacetChoice = { value: string; label: string; count: number };

/** Every facet's choices with counts, most common first (levels and semesters in order). */
export function facetCounts(rows: RegistryRow[], filters: RegistryFilters): Record<FacetKey, FacetChoice[]> {
  const out = {} as Record<FacetKey, FacetChoice[]>;
  for (const key of FACET_KEYS) {
    const counts = new Map<string, FacetChoice>();
    for (const row of rows) {
      if (!matchesFilters(row, filters, key)) continue;
      for (const item of valuesOf(row, key)) {
        const current = counts.get(item.value) ?? { ...item, count: 0 };
        current.count += 1;
        counts.set(item.value, current);
      }
    }
    // A chosen value stays listed even when nothing matches it now.
    const chosen = filters[key];
    if (chosen && chosen !== "all" && !counts.has(chosen)) counts.set(chosen, { value: chosen, label: chosen, count: 0 });
    const ordered = [...counts.values()];
    if (key === "level" || key === "semester") ordered.sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
    else ordered.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    out[key] = ordered;
  }
  return out;
}

/** The filters a request asked for (only known facets). */
export function readFilters(params: URLSearchParams): RegistryFilters {
  const filters: RegistryFilters = {};
  for (const key of FACET_KEYS) {
    const value = params.get(key);
    if (value && value !== "all") filters[key] = value.slice(0, 120);
  }
  return filters;
}
