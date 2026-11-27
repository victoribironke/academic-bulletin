"use client";

/**
 * Task W5: the graduation numbers the app writes from the Course Structure
 * (minimum departmental credits, minimum credits outside the department and
 * the overall minimum), so the sums always agree. The Head adds any
 * programme-specific conditions in words.
 */
import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CreditSummary } from "@/lib/courses/credit-summary";

type Numbers = CreditSummary & { statedTotal: number | null; graduationText: string | null };

export function GraduationNumbers({
  submissionId,
  refreshKey,
  totalUnits,
  canEdit,
  onUseTotal,
}: {
  submissionId: string;
  refreshKey: string;
  totalUnits: number;
  canEdit: boolean;
  onUseTotal: (total: number) => void;
}) {
  const [numbers, setNumbers] = useState<Numbers | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions/${submissionId}/credit-summary`)
      .then(async (res) => (res.ok ? ((await res.json()) as Numbers) : null))
      .then((data) => {
        if (!cancelled && data) setNumbers(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [submissionId, refreshKey, bump]);

  useEffect(() => {
    const onChange = () => setBump((value) => value + 1);
    window.addEventListener("bulletin:courses-changed", onChange);
    return () => window.removeEventListener("bulletin:courses-changed", onChange);
  }, []);

  if (!numbers || !numbers.graduationText) return null;
  const { totals } = numbers;
  const differs = totals.total !== totalUnits;

  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Calculator className="size-4" aria-hidden="true" />
        Graduation numbers, written by the app from the Course Structure
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Departmental</dt>
          <dd className="font-semibold">{totals.departmental}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Other departments</dt>
          <dd className="font-semibold">{totals.outside}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">General Education</dt>
          <dd className="font-semibold">{totals.generalEducation}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Overall minimum</dt>
          <dd className="font-semibold">{totals.total}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        The bulletin prints: &ldquo;{numbers.graduationText}&rdquo; Add any conditions of this programme in words above (rule W5).
      </p>
      {differs && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <span>
            The Total Credit Units below says {totalUnits}, but the saved Course Structure adds up to {totals.total}.
          </span>
          {canEdit && (
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => onUseTotal(totals.total)}>
              Use {totals.total}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
