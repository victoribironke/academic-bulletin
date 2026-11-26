"use client";

/**
 * Rule W18 (programmes with options): on a B.Agric. option's Course
 * Structure, says which levels the options share, that a change there is made
 * in the other options' drafts too, and what differs between them now. When
 * something differs, the person can make the other options match this draft.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, GitFork, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DELETE_WORD, useConfirmDelete } from "@/components/shared/typed-delete-dialog";
import { TRY_AGAIN } from "@/lib/messages";
import type { OptionDifference, SharedLevelsState } from "@/lib/programmes/option-families";

export type OptionFamilySummary = { sharedUpToLevel: number; sharedLevels: string; others: string[] };

const OPTIONS_CHANGED = "bulletin:options-changed";

/** Tells the notice to look again (after a save that reached the other options). */
export function announceOptionsChanged(submissionId: string) {
  window.dispatchEvent(new CustomEvent(OPTIONS_CHANGED, { detail: { submissionId } }));
}

function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function short(codes: string[]): string {
  return codes.length <= 6 ? codes.join(", ") : `${codes.slice(0, 6).join(", ")} and ${codes.length - 6} more`;
}

function differenceLines(option: OptionDifference): string[] {
  const lines: string[] = [];
  if (option.missing.length) lines.push(`doesn't have ${short(option.missing)}`);
  if (option.extra.length) lines.push(`also has ${short(option.extra)}`);
  if (option.changed.length) {
    lines.push(`prints ${short(option.changed.map((row) => `${row.code} (${row.fields.join(", ")})`))} differently`);
  }
  return lines;
}

export function OptionFamilyNotice({
  submissionId,
  canEdit,
  onFamily,
}: {
  submissionId: string;
  canEdit: boolean;
  onFamily?: (family: OptionFamilySummary | null) => void;
}) {
  const [state, setState] = useState<SharedLevelsState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [matching, setMatching] = useState(false);
  const { confirmDelete, dialog } = useConfirmDelete();
  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions/${submissionId}/options`)
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const body = await res.json();
        const next = body.family ? (body as SharedLevelsState) : null;
        setState(next);
        onFamily?.(
          next ? { sharedUpToLevel: next.sharedUpToLevel, sharedLevels: next.sharedLevels, others: next.options.map((option) => option.option) } : null,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [submissionId, reloadKey, onFamily]);

  useEffect(() => {
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ submissionId?: string }>).detail?.submissionId === submissionId) reload();
    };
    window.addEventListener("bulletin:courses-changed", onChanged);
    window.addEventListener(OPTIONS_CHANGED, onChanged);
    return () => {
      window.removeEventListener("bulletin:courses-changed", onChanged);
      window.removeEventListener(OPTIONS_CHANGED, onChanged);
    };
  }, [reload, submissionId]);

  if (!state) return null;

  const differing = state.options.filter((option) => differenceLines(option).length > 0);
  const fixable = differing.filter((option) => option.canEdit);
  const others = state.options.map((option) => option.option);

  const match = async () => {
    const removes = fixable.flatMap((option) => option.extra.map((code) => `${code} (${option.option})`));
    const confirmed = await confirmDelete({
      title: `Make ${names(fixable.map((option) => option.option))} match ${state.option}?`,
      description: `Their ${state.sharedLevels} becomes the same as this draft's: missing courses are added and differing ones changed.${
        removes.length ? " Courses only they have go to the Archive, where an administrator can restore them." : ""
      } Their 500 level isn't touched.`,
      items: removes.length ? removes : undefined,
      actionLabel: "Make them match",
    });
    if (!confirmed) return;
    setMatching(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: DELETE_WORD }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't make the options match", { description: body.error ?? TRY_AGAIN });
        return;
      }
      toast.success("The options' shared levels now match this draft.", { description: body.note ?? undefined });
      reload();
    } finally {
      setMatching(false);
    }
  };

  return (
    <section aria-labelledby={`${submissionId}-options`} className="space-y-2 rounded-md border p-3">
      <h3 id={`${submissionId}-options`} className="flex items-center gap-2 text-sm font-semibold">
        <GitFork className="h-4 w-4 text-primary" aria-hidden="true" />
        {state.family}: the {state.option} option
      </h3>
      <p className="text-sm text-muted-foreground">
        {state.sharedLevels} is shared with {names(others)}. A course you add, change or delete at these levels is
        changed in their drafts too. 500 level is this option&apos;s own.
      </p>
      {differing.length === 0 ? (
        <p className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {state.sharedLevels} is the same in all {state.options.length + 1} options.
        </p>
      ) : (
        <div className="space-y-2">
          <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-400">
            {differing.map((option) => (
              <li key={option.submissionId} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {option.option} {differenceLines(option).join("; ")}.
                  {!option.canEdit && " Its draft isn't open to you at this stage."}
                </span>
              </li>
            ))}
          </ul>
          {canEdit && fixable.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void match()} disabled={matching}>
              {matching && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Make the other options match this draft
            </Button>
          )}
        </div>
      )}
      {dialog}
    </section>
  );
}
