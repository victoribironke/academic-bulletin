"use client";

/**
 * Task F2: on every programme, what is still open before it can be
 * submitted (or approved), grouped by section with counts, from the rules
 * engine (F1). "Fix this" opens the section; a "Please check" can be accepted
 * with a reason, kept on the record. It turns green when nothing that must be
 * fixed remains.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TRY_AGAIN } from "@/lib/messages";

type Result = {
  rule: string;
  level: "MUST" | "CHECK" | "FIXED";
  section: string;
  field?: string;
  key: string;
  message: string;
  accepted: { reason: string; by: string | null; at: string } | null;
};

type Checks = { ready: boolean; counts: { mustFix: number; pleaseCheck: number; accepted: number }; results: Result[] };

const SECTION_TITLES: Record<string, string> = {
  deans_hods: "Deans & HODs",
  staff: "Staff Directory",
  overview: "Programme Overview",
  admission: "Admission Requirements",
  graduation: "Graduation Requirements",
  courses: "Course Structure",
  descriptions: "Course Details",
  regulations: "Regulations & Changes",
};
const ORDER = Object.keys(SECTION_TITLES);

export function ReadinessPanel({
  submissionId,
  refreshKey,
  canEdit,
  onGoToSection,
}: {
  submissionId: string;
  refreshKey: string;
  canEdit: boolean;
  onGoToSection: (section: string) => void;
}) {
  const [checks, setChecks] = useState<Checks | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [bump, setBump] = useState(0);
  const reload = useCallback(() => setBump((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions/${submissionId}/checks`)
      .then(async (res) => (res.ok ? ((await res.json()) as Checks) : null))
      .then((data) => {
        if (!cancelled && data) setChecks(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [submissionId, refreshKey, bump]);

  useEffect(() => {
    const onChange = () => reload();
    window.addEventListener("bulletin:courses-changed", onChange);
    window.addEventListener("bulletin:section-saved", onChange);
    return () => {
      window.removeEventListener("bulletin:courses-changed", onChange);
      window.removeEventListener("bulletin:section-saved", onChange);
    };
  }, [reload]);

  if (!checks) return null;

  const openResults = checks.results.filter((result) => result.level === "MUST" || (result.level === "CHECK" && !result.accepted));
  const accepted = checks.results.filter((result) => result.accepted);
  const sections = ORDER.filter((section) => openResults.some((result) => result.section === section));

  const accept = async (key: string, withdraw = false) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withdraw ? { key, withdraw: true } : { key, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(withdraw ? "Couldn't take the acceptance back" : "Couldn't accept it", { description: body.error ?? TRY_AGAIN });
        return;
      }
      setAccepting(null);
      setReason("");
      reload();
      window.dispatchEvent(new CustomEvent("bulletin:section-saved", { detail: { submissionId } }));
    } finally {
      setSaving(false);
    }
  };

  const tone = checks.ready
    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
    : "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10";

  return (
    <section aria-labelledby={`${submissionId}-readiness`} className={`rounded-md border p-3 ${tone}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span id={`${submissionId}-readiness`} className="flex items-center gap-2 text-sm font-medium">
          {checks.ready ? (
            <CheckCircle2 className="size-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <CircleAlert className="size-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          )}
          {checks.ready
            ? `Ready: nothing must be fixed${checks.counts.pleaseCheck ? `; ${checks.counts.pleaseCheck} to check` : ""}.`
            : `Before it can be submitted: ${checks.counts.mustFix} to fix${checks.counts.pleaseCheck ? `, ${checks.counts.pleaseCheck} to check` : ""}.`}
        </span>
        {expanded ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {sections.length === 0 && <p className="text-sm text-muted-foreground">Nothing is open. Every check has passed or been accepted.</p>}
          {sections.map((section) => {
            const items = openResults.filter((result) => result.section === section);
            return (
              <div key={section} className="space-y-1">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {SECTION_TITLES[section]} ({items.length})
                </h4>
                <ul className="space-y-1">
                  {items.map((result) => (
                    <li key={result.key} className="rounded border bg-background p-2 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="flex min-w-0 items-start gap-1.5">
                          {result.level === "MUST" ? (
                            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Must fix" />
                          ) : (
                            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Please check" />
                          )}
                          <span>
                            <span className="sr-only">{result.level === "MUST" ? "Must fix: " : "Please check: "}</span>
                            {result.message}{" "}
                            <span className="text-xs text-muted-foreground">({result.rule === "Required" ? "required" : result.rule})</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-1">
                          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onGoToSection(result.section)}>
                            Fix this
                          </Button>
                          {result.level === "CHECK" && canEdit && (
                            <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setAccepting(accepting === result.key ? null : result.key)}>
                              Accept with a reason
                            </Button>
                          )}
                        </span>
                      </div>
                      {accepting === result.key && (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            value={reason}
                            maxLength={500}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Why this is right for the programme, for example: approved by Senate in 2023"
                            aria-label={`Reason for accepting: ${result.message}`}
                          />
                          <Button type="button" size="sm" disabled={saving || reason.trim().length < 10} onClick={() => void accept(result.key)}>
                            {saving && <Loader2 className="animate-spin" />} Accept
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {accepted.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Accepted with a reason ({accepted.length})</summary>
              <ul className="mt-1 space-y-1">
                {accepted.map((result) => (
                  <li key={result.key} className="rounded border bg-background p-2">
                    {result.message}
                    <span className="block text-xs text-muted-foreground">
                      {result.accepted!.by ?? "Someone"}: {result.accepted!.reason}
                    </span>
                    {canEdit && (
                      <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" disabled={saving} onClick={() => void accept(result.key, true)}>
                        Take it back
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
