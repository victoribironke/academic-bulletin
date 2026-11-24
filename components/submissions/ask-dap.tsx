"use client";

/**
 * Task H6: "Ask DAP" on every section of a draft. The question names the
 * field it is about and goes to the DAP officer for the programme's school,
 * who aims to answer within one working day. The section's questions and
 * their answers are listed under the button. Hidden where H6's database
 * update hasn't run yet.
 */
import { useEffect, useId, useState } from "react";
import { Loader2, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/dates/format";

/** The fields of each section, offered when asking (any other text is fine). */
export const SECTION_FIELDS: Record<string, string[]> = {
  deans_hods: ["Dean's photo and profile", "Head of Department's photo and profile"],
  staff: ["Academic staff", "Adjunct staff", "Non-academic staff", "Ranks and qualifications"],
  overview: ["Philosophy", "Mission", "Vision", "Objectives", "Unique features", "Employability"],
  admission: ["UTME requirements", "Direct entry", "Transfer", "Minimum duration"],
  graduation: ["Graduation requirements", "Minimum CGPA", "Total credit units"],
  courses: ["Course list", "Units", "Semesters", "General Education block"],
  descriptions: ["Learning outcomes", "Course content", "Lab work", "Entrepreneurial aspect"],
  regulations: ["Programme regulations", "Summary of changes"],
};

type Question = {
  id: string;
  section: string;
  field: string | null;
  question: string;
  status: string;
  answer: string | null;
  askedAt: string;
  dueAt: string;
  overdue: boolean;
  askedBy: string | null;
  officer: string | null;
  answeredBy: string | null;
};

export function AskDap({
  submissionId,
  section,
  sectionTitle,
}: {
  submissionId: string;
  section: string;
  sectionTitle: string;
}) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const fieldId = useId();
  const textId = useId();
  const listId = useId();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions/${submissionId}/questions`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 503) setHidden(true);
        else if (res.ok) setQuestions(await res.json());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [submissionId, reloadKey]);

  if (hidden || !questions) return null;
  const mine = questions.filter((question) => question.section === section);

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, field, question: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(
          data.officer
            ? `Sent to ${data.officer}. Expect an answer by ${formatDateTime(data.dueAt)}.`
            : `Sent to DAP. Expect an answer by ${formatDateTime(data.dueAt)}.`,
        );
        setOpen(false);
        setField("");
        setText("");
        setReloadKey((key) => key + 1);
      } else {
        toast.error("Couldn't send the question", { description: data.error ?? "Please try again." });
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MessageCircleQuestion className="mr-1 h-4 w-4" aria-hidden="true" />
        Ask DAP
      </Button>

      {mine.length > 0 && (
        <ul className="space-y-2" aria-label={`Questions to DAP about ${sectionTitle}`}>
          {mine.map((question) => (
            <li key={question.id} className="rounded-md bg-muted/40 p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={question.status === "ANSWERED" ? "secondary" : question.overdue ? "destructive" : "outline"}>
                  {question.status === "ANSWERED" ? "Answered" : question.overdue ? "Answer overdue" : "Waiting for DAP"}
                </Badge>
                {question.field && <span className="font-medium">{question.field}</span>}
                <span className="text-xs text-muted-foreground">
                  {question.askedBy ?? "Someone"}, {formatDateTime(question.askedAt)}
                </span>
              </div>
              <p className="mt-1">{question.question}</p>
              {question.answer ? (
                <p className="mt-1 border-l-2 border-primary/40 pl-2">
                  <span className="font-medium">{question.answeredBy ?? "DAP"}:</span> {question.answer}
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {question.officer ? `With ${question.officer}. ` : ""}Answer expected by {formatDateTime(question.dueAt)}.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={(next) => !sending && setOpen(next)}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <DialogHeader>
              <DialogTitle>Ask DAP about {sectionTitle}</DialogTitle>
              <DialogDescription>
                Your question goes to the DAP officer for your school, who aims to answer within one working
                day. The answer appears here and by email.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={fieldId}>Which part? (optional)</Label>
              <Input id={fieldId} list={listId} value={field} onChange={(event) => setField(event.target.value)} maxLength={100} />
              <datalist id={listId}>
                {(SECTION_FIELDS[section] ?? []).map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor={textId}>Your question</Label>
              <Textarea id={textId} value={text} onChange={(event) => setText(event.target.value)} rows={4} maxLength={2000} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending || text.trim().length < 10}>
                {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Send to DAP
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
