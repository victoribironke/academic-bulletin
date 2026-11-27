"use client";

/**
 * Task G7: comments in one place. This section's comments, or every
 * section's, filtered by open or resolved, section and author. Approval and
 * return notes are decision notes kept on the phase change: listed apart,
 * never counted as open comments.
 */
import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMMENT_TYPE_LABELS } from "@/lib/plain-words";
import { PHASE_NAMES } from "@/lib/submissions/phases";
import { formatDate } from "@/lib/dates/format";

type CommentItem = {
  id: string;
  content: string;
  section: string | null;
  phase: number;
  type: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  author: { firstName: string; lastName: string; role: string };
};

type DecisionNote = {
  id: string;
  fromPhase: number;
  toPhase: number;
  action: string;
  remarks: string | null;
  transitionedAt: string;
  performedBy: { firstName: string; lastName: string };
};

const TYPE_COLOURS: Record<string, string> = {
  SUGGESTION: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  ISSUE: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  QUESTION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  APPROVAL: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
};

const ACTION_WORDS: Record<string, string> = {
  SUBMIT: "Submitted",
  APPROVE: "Approved",
  RETURN: "Returned",
  REJECT: "Sent back",
  RECALL: "Recalled",
};

const ALL = "all";
const name = (person: { firstName: string; lastName: string }) => `${person.firstName} ${person.lastName}`.trim();

export function CommentsList({
  comments,
  decisions,
  sections,
  activeSection,
  canResolve,
  onResolve,
}: {
  comments: CommentItem[];
  decisions: DecisionNote[];
  sections: { key: string; title: string }[];
  activeSection: string;
  canResolve: boolean;
  onResolve: (id: string, status: "OPEN" | "RESOLVED") => void;
}) {
  const [scope, setScope] = useState<"section" | "all">("section");
  const [status, setStatus] = useState<"OPEN" | "RESOLVED" | typeof ALL>(ALL);
  const [section, setSection] = useState<string>(ALL);
  const [author, setAuthor] = useState<string>(ALL);

  const titles = useMemo(() => new Map(sections.map((item) => [item.key, item.title])), [sections]);
  const authors = useMemo(() => [...new Set(comments.map((comment) => name(comment.author)))].sort(), [comments]);
  const shown = comments
    .filter((comment) => (scope === "section" ? comment.section === activeSection : section === ALL || comment.section === section))
    .filter((comment) => status === ALL || comment.status === status)
    .filter((comment) => author === ALL || name(comment.author) === author)
    .sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === "OPEN" ? -1 : 1));
  const openAll = comments.filter((comment) => comment.status === "OPEN").length;
  const notes = decisions.filter((item) => item.remarks?.trim());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Which comments">
        <Button type="button" size="sm" variant={scope === "section" ? "secondary" : "ghost"} className="h-7" onClick={() => setScope("section")}>
          This section
        </Button>
        <Button type="button" size="sm" variant={scope === "all" ? "secondary" : "ghost"} className="h-7" onClick={() => setScope("all")}>
          All sections{openAll > 0 ? ` (${openAll} open)` : ""}
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
            <SelectTrigger className="h-8" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Open and resolved</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {scope === "all" && (
          <div className="space-y-1">
            <Label className="text-xs">Section</Label>
            <Select value={section} onValueChange={setSection}>
              <SelectTrigger className="h-8" aria-label="Filter by section">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Every section</SelectItem>
                {sections.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.title} ({comments.filter((comment) => comment.section === item.key).length})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Author</Label>
          <Select value={author} onValueChange={setAuthor}>
            <SelectTrigger className="h-8" aria-label="Filter by author">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              {authors.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ul className="space-y-3" aria-live="polite">
        {shown.length === 0 && (
          <li className="py-8 text-center text-sm text-muted-foreground">
            {scope === "section" ? "No comments for this section" : "No comments match these filters"}
          </li>
        )}
        {shown.map((comment) => (
          <li key={comment.id} className={`rounded-lg border p-3 ${comment.status === "RESOLVED" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{name(comment.author)}</span>
                <Badge variant="secondary" className={`text-xs ${TYPE_COLOURS[comment.type] ?? ""}`}>
                  {COMMENT_TYPE_LABELS[comment.type as keyof typeof COMMENT_TYPE_LABELS] ?? comment.type}
                </Badge>
                {comment.status === "RESOLVED" && <span className="text-xs text-muted-foreground">Resolved</span>}
              </div>
              {canResolve && (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => onResolve(comment.id, comment.status)}>
                  {comment.status === "OPEN" ? "Resolve" : "Reopen"}
                </Button>
              )}
            </div>
            <p className="mt-1 text-sm">{comment.content}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatDate(comment.createdAt)}
              <span>• Phase {comment.phase}</span>
              {scope === "all" && <span>• {comment.section ? titles.get(comment.section) ?? comment.section : "Whole programme"}</span>}
            </div>
          </li>
        ))}
      </ul>

      {scope === "all" && notes.length > 0 && (
        <section aria-labelledby="decision-notes" className="space-y-2 border-t pt-3">
          <h3 id="decision-notes" className="text-sm font-semibold">
            Decision notes
          </h3>
          <p className="text-xs text-muted-foreground">
            Notes written when the bulletin was approved, returned or sent back. They stay with that step and are not open comments.
          </p>
          <ul className="space-y-2">
            {notes.map((item) => (
              <li key={item.id} className="rounded-lg border bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {ACTION_WORDS[item.action] ?? item.action} at Phase {item.fromPhase} ({PHASE_NAMES[item.fromPhase] ?? ""}) by {name(item.performedBy)},{" "}
                  {formatDate(item.transitionedAt)}
                </p>
                <p className="mt-1">{item.remarks}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
