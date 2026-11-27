"use client";

/**
 * Task K5: the Course Registry's filters, each choice with how many courses
 * it would show. A filter with a single choice isn't offered.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FACET_KEYS, FACET_LABELS, type FacetChoice, type FacetKey, type RegistryFilters } from "@/lib/courses/registry-filters";

export function RegistryFilterSelects({
  facets,
  filters,
  onChange,
}: {
  facets: Partial<Record<FacetKey, FacetChoice[]>> | null;
  filters: RegistryFilters;
  onChange: (key: FacetKey, value: string) => void;
}) {
  return (
    <>
      {FACET_KEYS.map((key) => {
        const choices = facets?.[key] ?? [];
        const chosen = filters[key] ?? "all";
        if (choices.length < 2 && chosen === "all") return null;
        return (
          <Select key={key} value={chosen} onValueChange={(value) => onChange(key, value)}>
            <SelectTrigger className="w-full bg-card sm:w-44" aria-label={FACET_LABELS[key]}>
              <SelectValue placeholder={`Any ${FACET_LABELS[key].toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any {FACET_LABELS[key].toLowerCase()}</SelectItem>
              {choices.map((choice) => (
                <SelectItem key={choice.value} value={choice.value} disabled={choice.count === 0 && choice.value !== chosen}>
                  {choice.label} ({choice.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}
    </>
  );
}
