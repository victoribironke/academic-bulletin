"use client";

/**
 * Task G4: the tick, amber dot or red number beside each section of a draft.
 * Loaded from /api/submissions/[id]/sections and refreshed after saves.
 */
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type SectionMark = {
  state: "done" | "check" | "fix" | "none";
  count: number;
  label: string;
};

/** The marks for every section; `refreshKey` changes when the page saves. */
export function useSectionMarks(submissionId: string, refreshKey: string): Record<string, SectionMark> | null {
  const [marks, setMarks] = useState<Record<string, SectionMark> | null>(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions/${submissionId}/sections`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { marks?: Record<string, SectionMark> } | null) => {
        if (!cancelled && data?.marks) setMarks(data.marks);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [submissionId, refreshKey, bump]);

  useEffect(() => {
    // Sections that save on their own announce it (courses, details, staff).
    const refresh = () => setBump((value) => value + 1);
    window.addEventListener("bulletin:courses-changed", refresh);
    window.addEventListener("bulletin:section-saved", refresh);
    return () => {
      window.removeEventListener("bulletin:courses-changed", refresh);
      window.removeEventListener("bulletin:section-saved", refresh);
    };
  }, []);

  return marks;
}

/** The mark itself, with its meaning for screen readers and on hover. */
export function SectionMarkIcon({ mark }: { mark?: SectionMark }) {
  if (!mark || mark.state === "none") return null;
  if (mark.state === "done") {
    return (
      <span title={mark.label} className="shrink-0">
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span className="sr-only">{mark.label}</span>
      </span>
    );
  }
  if (mark.state === "check") {
    return (
      <span title={mark.label} className="flex size-4 shrink-0 items-center justify-center">
        <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
        <span className="sr-only">{mark.label}</span>
      </span>
    );
  }
  return (
    <span
      title={mark.label}
      className={cn("shrink-0 rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white")}
    >
      <span aria-hidden="true">{mark.count}</span>
      <span className="sr-only">{mark.label}</span>
    </span>
  );
}

/** Short words for the phone-sized section picker. */
export function sectionMarkWords(mark?: SectionMark): string {
  if (!mark || mark.state === "none") return "";
  if (mark.state === "done") return " ✓";
  if (mark.state === "check") return " (check)";
  return ` (${mark.count} to fix)`;
}
