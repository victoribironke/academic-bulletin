"use client";

/**
 * Task H7: the AI helper for a section. "Draft from 2023-2027" offers last
 * bulletin's words, "Make this GRACE compliant" checks the Philosophy and
 * offers GRACE's version, and "Explain this comment" puts a reviewer's
 * comment in plain words. Nothing changes until the person clicks to use it.
 */
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CARRIED_FIELDS } from "@/lib/bulletin/carried-fields";
import { TRY_AGAIN } from "@/lib/messages";

type Action = "draft" | "grace" | "explain";
type CommentItem = { id: string; content: string; status: string; author: { firstName: string; lastName: string } };

export function AiHelper({
  submissionId,
  section,
  sectionTitle,
  programmeName,
  philosophy,
  comments,
  canEdit,
  onApply,
}: {
  submissionId: string;
  section: string;
  sectionTitle: string;
  programmeName: string;
  philosophy: string;
  comments: CommentItem[];
  canEdit: boolean;
  /** Puts a text the person accepted into a field of the page (it then saves as usual). */
  onApply: (field: string, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<Action>("draft");
  const [baseline, setBaseline] = useState<Record<string, string> | null>(null);
  const [baselineMissing, setBaselineMissing] = useState(false);
  const [grace, setGrace] = useState<{ passed: boolean; explanation?: string; suggestedContent?: string } | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const fields = CARRIED_FIELDS.filter((field) => field.section === section);

  const loadBaseline = async () => {
    if (baseline || baselineMissing) return;
    setBusy("draft");
    try {
      const res = await fetch(`/api/submissions/${submissionId}/baseline`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error);
      if (!body.hasBaseline) setBaselineMissing(true);
      else setBaseline(body.texts ?? {});
    } catch (error) {
      toast.error("Couldn't load the 2023-2027 text", { description: error instanceof Error && error.message ? error.message : TRY_AGAIN });
    } finally {
      setBusy(null);
    }
  };

  const checkGrace = async () => {
    setBusy("grace");
    setGrace(null);
    try {
      const res = await fetch("/api/grace-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "philosophy", submissionId, title: `${programmeName} - Programme Philosophy`, content: philosophy }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error);
      setGrace(body);
    } catch (error) {
      toast.error("GRACE couldn't check the Philosophy", { description: error instanceof Error && error.message ? error.message : TRY_AGAIN });
    } finally {
      setBusy(null);
    }
  };

  const explain = async (comment: CommentItem) => {
    setBusy(comment.id);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "explain-comment", commentId: comment.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error);
      setExplanations((current) => ({ ...current, [comment.id]: body.explanation }));
    } catch (error) {
      toast.error("Couldn't explain the comment", { description: error instanceof Error && error.message ? error.message : TRY_AGAIN });
    } finally {
      setBusy(null);
    }
  };

  const use = (field: string, text: string, label: string) => {
    onApply(field, text);
    toast.success(`${label} is in the form`, { description: "It saves like your own typing; change it as you need." });
  };

  const choose = (next: Action) => {
    setAction(next);
    if (next === "draft") void loadBaseline();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value && action === "draft") void loadBaseline();
      }}
    >
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Sparkles className="h-4 w-4" /> AI helper
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto p-6 sm:max-w-lg">
        <SheetHeader className="mb-4">
          <SheetTitle>AI helper: {sectionTitle}</SheetTitle>
          <SheetDescription>Suggestions only. Nothing changes until you click to use it, and you can edit it afterwards.</SheetDescription>
        </SheetHeader>

        <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="What the helper does">
          <Button type="button" size="sm" variant={action === "draft" ? "secondary" : "ghost"} onClick={() => choose("draft")}>
            Draft from 2023-2027
          </Button>
          <Button type="button" size="sm" variant={action === "grace" ? "secondary" : "ghost"} onClick={() => choose("grace")}>
            Make this GRACE compliant
          </Button>
          <Button type="button" size="sm" variant={action === "explain" ? "secondary" : "ghost"} onClick={() => choose("explain")}>
            Explain this comment
          </Button>
        </div>

        {action === "draft" && (
          <div className="space-y-3">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">The 2023-2027 bulletin has no text for this section to start from.</p>
            ) : busy === "draft" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Finding the 2023-2027 text…
              </p>
            ) : baselineMissing ? (
              <p className="text-sm text-muted-foreground">This programme wasn&apos;t in the 2023-2027 bulletin, so there is nothing to start from.</p>
            ) : (
              fields.map((field) => {
                const text = baseline?.[field.key];
                return (
                  <div key={field.key} className="space-y-2 rounded-md border p-3">
                    <p className="text-sm font-medium">{field.label}</p>
                    {text ? (
                      <>
                        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
                        {canEdit && (
                          <Button type="button" size="sm" onClick={() => use(field.key, text, field.label)}>
                            Use this
                          </Button>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">No 2023-2027 text.</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {action === "grace" && (
          <div className="space-y-3">
            {section !== "overview" ? (
              <p className="text-sm text-muted-foreground">
                GRACE checks the Philosophy (in Programme Overview) and each course description (in Course Details, where a failing course
                shows GRACE&apos;s suggested version to use).
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">GRACE scores the Philosophy on its five pillars and, if it falls short, suggests a version that passes.</p>
                <Button type="button" size="sm" onClick={() => void checkGrace()} disabled={busy === "grace" || !philosophy.trim()}>
                  {busy === "grace" && <Loader2 className="animate-spin" />} Check the Philosophy
                </Button>
                {grace && (
                  <div className="space-y-2 rounded-md border p-3 text-sm">
                    <p className="font-medium">{grace.passed ? "It passes GRACE." : "It doesn't pass GRACE yet."}</p>
                    {grace.explanation && <p className="text-muted-foreground">{grace.explanation}</p>}
                    {!grace.passed && grace.suggestedContent?.trim() && (
                      <>
                        <p className="font-medium">GRACE&apos;s suggested version</p>
                        <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-muted-foreground">{grace.suggestedContent}</p>
                        {canEdit && (
                          <Button type="button" size="sm" onClick={() => use("philosophy", grace.suggestedContent!, "GRACE's version")}>
                            Use this version
                          </Button>
                        )}
                        <p className="text-xs text-muted-foreground">Check it with GRACE again once you have adjusted it.</p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {action === "explain" && (
          <ul className="space-y-3">
            {comments.length === 0 && <li className="text-sm text-muted-foreground">This section has no comments.</li>}
            {comments.map((comment) => (
              <li key={comment.id} className="space-y-2 rounded-md border p-3 text-sm">
                <p>
                  <span className="font-medium">
                    {comment.author.firstName} {comment.author.lastName}:
                  </span>{" "}
                  {comment.content}
                </p>
                {explanations[comment.id] ? (
                  <p className="whitespace-pre-wrap rounded bg-muted/60 p-2">{explanations[comment.id]}</p>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => void explain(comment)} disabled={busy === comment.id}>
                    {busy === comment.id && <Loader2 className="animate-spin" />} Explain
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
