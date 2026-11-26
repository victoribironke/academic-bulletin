"use client";

/**
 * Tasks E2 and E3 on the draft page. Under each field that started from the
 * 2023-2027 bulletin: "From the 2023-2027 bulletin: please review", with Mark
 * reviewed (rule V18) and Compare with 2023-2027. Editing the field also
 * counts as reviewing it. Under the Summary of Changes: a first draft built
 * from the differences.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Check, FileDiff, History, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CARRIED_NOTE, carriedField, carriedText, diffWords } from "@/lib/bulletin/carried-fields";
import { SafeRichText } from "@/components/shared/safe-rich-text";
import { TRY_AGAIN } from "@/lib/messages";

type State = { hasBaseline: boolean; file?: string | null; carried: string[]; texts: Record<string, string> };

type CarriedContext = {
  state: State | null;
  canEdit: boolean;
  markReviewed: (key: string) => Promise<void>;
  compare: (key: string, now: unknown) => void;
};

const Context = createContext<CarriedContext | null>(null);

export function CarriedTextProvider({
  submissionId,
  refreshKey,
  canEdit,
  children,
}: {
  submissionId: string;
  /** Changes when the draft saves, so an edited field loses its note. */
  refreshKey: string;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<State | null>(null);
  const [comparing, setComparing] = useState<{ key: string; now: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions/${submissionId}/baseline`)
      .then(async (res) => (res.ok ? ((await res.json()) as State) : null))
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [submissionId, refreshKey]);

  const markReviewed = useCallback(
    async (key: string) => {
      const res = await fetch(`/api/submissions/${submissionId}/baseline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: [key] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't mark it reviewed", { description: body.error ?? TRY_AGAIN });
        return;
      }
      setState((previous) => (previous ? { ...previous, carried: body.carried } : previous));
      window.dispatchEvent(new CustomEvent("bulletin:section-saved", { detail: { submissionId } }));
    },
    [submissionId],
  );

  const compare = useCallback((key: string, now: unknown) => {
    const field = carriedField(key);
    if (field) setComparing({ key, now: carriedText(field.kind, now) });
  }, []);

  const value = useMemo(() => ({ state, canEdit, markReviewed, compare }), [state, canEdit, markReviewed, compare]);
  const field = comparing ? carriedField(comparing.key) : null;
  const before = comparing && state ? state.texts[comparing.key] ?? "" : "";

  return (
    <Context.Provider value={value}>
      {children}
      <Dialog open={comparing !== null} onOpenChange={(open) => !open && setComparing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{field?.label}: compare with 2023-2027</DialogTitle>
            <DialogDescription>
              Struck-through words were in the 2023-2027 bulletin
              {state?.file ? ` (${state.file})` : ""}; highlighted words are new in this draft.
            </DialogDescription>
          </DialogHeader>
          {comparing && <CompareText before={before} after={comparing.now} />}
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}

function CompareText({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  if (!before && !after) return <p className="text-sm text-muted-foreground">Neither version has text here.</p>;
  if (before === after) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">No change from 2023-2027.</p>
        <p className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-sm">{before}</p>
      </div>
    );
  }
  return (
    <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-sm leading-relaxed">
      {parts.map((part, index) =>
        part.change === "same" ? (
          <span key={index}>{part.text}</span>
        ) : part.change === "removed" ? (
          <del key={index} className="bg-destructive/10 text-destructive decoration-destructive/60">
            {part.text}
          </del>
        ) : (
          <ins key={index} className="bg-emerald-100 text-emerald-900 no-underline dark:bg-emerald-500/20 dark:text-emerald-200">
            {part.text}
          </ins>
        ),
      )}
    </p>
  );
}

/** Under a field: the review note while it is carried, and the compare link. */
export function CarriedNote({ field, value }: { field: string; value: unknown }) {
  const context = useContext(Context);
  const [saving, setSaving] = useState(false);
  if (!context?.state?.hasBaseline) return null;
  const { state, canEdit, markReviewed, compare } = context;
  const carried = state.carried.includes(field);
  const hasText = Boolean(state.texts[field]);
  if (!carried && !hasText) return null;
  const compareButton = (
    <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => compare(field, value)}>
      <FileDiff className="size-3.5" /> Compare with 2023-2027
    </Button>
  );
  if (!carried) return <div className="mt-1">{compareButton}</div>;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <span className="flex items-center gap-1">
        <History className="size-3.5" aria-hidden="true" />
        {CARRIED_NOTE}
      </span>
      {canEdit && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await markReviewed(field);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Mark reviewed
        </Button>
      )}
      {compareButton}
    </div>
  );
}

/** E3: a first Summary of Changes, built from the differences with 2023-2027. */
export function DraftSummaryButton({
  submissionId,
  current,
  onUse,
}: {
  submissionId: string;
  current: string;
  onUse: (html: string) => void;
}) {
  const context = useContext(Context);
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!context?.state?.hasBaseline || !context.canEdit) return null;

  const open = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/baseline?summary=1`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't draft the summary", { description: body.error ?? TRY_AGAIN });
        return;
      }
      setDraft(body.html as string);
    } finally {
      setLoading(false);
    }
  };
  const hasText = carriedText("html", current).length > 0;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => void open()} disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <Wand2 />} Draft from the differences with 2023-2027
      </Button>
      <Dialog open={draft !== null} onOpenChange={(isOpen) => !isOpen && setDraft(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Summary of Changes: a first draft</DialogTitle>
            <DialogDescription>
              Built from what differs between this draft and the 2023-2027 bulletin. Edit it to say why each change
              was made.{hasText ? " Your current summary is kept unless you replace it." : ""}
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <SafeRichText html={draft} className="prose prose-sm max-h-[50vh] max-w-none overflow-y-auto rounded-md border p-3 dark:prose-invert" />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            {hasText && draft && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onUse(`${current}${draft}`);
                  setDraft(null);
                }}
              >
                Add below mine
              </Button>
            )}
            {draft && (
              <Button
                type="button"
                onClick={() => {
                  onUse(draft);
                  setDraft(null);
                }}
              >
                {hasText ? "Replace mine" : "Use this draft"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
