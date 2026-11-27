"use client";

/**
 * Task B11: an AI first draft of a course's outcomes and content, from the
 * national curriculum text where there is one. It is clearly marked and
 * goes into the form only when the person chooses to use it; they then
 * check and edit it like their own writing.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TRY_AGAIN } from "@/lib/messages";

type Draft = { label: string; source: string | null; learningOutcomes: string[]; courseContent: string };

export function AiFirstDraft({ courseId, onUse }: { courseId: string; onUse: (outcomes: string[], content: string) => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/ai-draft`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't draft it", { description: body.error ?? TRY_AGAIN });
        return;
      }
      setDraft(body);
    } finally {
      setBusy(false);
    }
  };

  if (!draft) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void ask()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} AI first draft
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-dashed border-amber-400 bg-amber-50/60 p-3 text-sm dark:border-amber-500/50 dark:bg-amber-500/10">
      <p className="font-semibold text-amber-800 dark:text-amber-300">{draft.label}</p>
      <p className="text-xs text-muted-foreground">
        {draft.source ? `Built from the national curriculum (${draft.source}).` : "There is no national curriculum text for this course, so it is built from the title."} Nothing is
        saved until you use it.
      </p>
      <ol className="list-decimal space-y-1 pl-5">
        {draft.learningOutcomes.map((outcome, index) => (
          <li key={index}>{outcome}</li>
        ))}
      </ol>
      <p className="whitespace-pre-wrap text-muted-foreground">{draft.courseContent}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onUse(draft.learningOutcomes, draft.courseContent);
            setDraft(null);
            toast.success("The draft is in the form", { description: "Check and edit it before you send it on." });
          }}
        >
          Use this draft
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
          Discard
        </Button>
      </div>
    </div>
  );
}
