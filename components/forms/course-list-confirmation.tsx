"use client";

/**
 * Task B10: the Head of Department confirms the programme's course list, or
 * asks DAP for a change. Shows who confirmed it and when, whether the list
 * changed since, and every change request with DAP's answer. Hidden on a site
 * where the B10 database update hasn't run yet.
 */
import { useCallback, useEffect, useId, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/dates/format";

const KINDS = {
  ADD: "Add a course",
  REMOVE: "Remove a course",
  UNITS: "Change the units",
  SEMESTER: "Change the semester",
  OTHER: "Something else",
} as const;
type Kind = keyof typeof KINDS;

const STATUS_LABELS: Record<string, string> = { OPEN: "Waiting for DAP", DONE: "Done", DECLINED: "Declined" };

type State = {
  confirmation: {
    confirmedAt: string;
    confirmedBy: string | null;
    courseCount: number;
    changedSince: boolean;
  } | null;
  requests: {
    id: string;
    kind: Kind;
    courseCode: string | null;
    details: string;
    status: string;
    response: string | null;
    requestedAt: string;
    requestedBy: string | null;
  }[];
};

export function CourseListConfirmation({
  submissionId,
  canConfirm,
  canAsk,
}: {
  submissionId: string;
  /** The department's Head, while the draft can be edited. */
  canConfirm: boolean;
  /** Anyone who can edit the draft. */
  canAsk: boolean;
}) {
  const [state, setState] = useState<State | null>(null);
  const [hidden, setHidden] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [kind, setKind] = useState<Kind>("ADD");
  const [courseCode, setCourseCode] = useState("");
  const [details, setDetails] = useState("");
  const codeId = useId();
  const detailsId = useId();

  // Bumped to load again: after a confirmation, a request, or a saved list.
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions/${submissionId}/course-list`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 503 || res.status === 403) setHidden(true);
        else if (res.ok) setState(await res.json());
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [submissionId, reloadKey]);

  useEffect(() => {
    // A saved change to the course list may mean it needs confirming again.
    const onChanged = (event: Event) => {
      if ((event as CustomEvent<{ submissionId?: string }>).detail?.submissionId === submissionId) load();
    };
    window.addEventListener("bulletin:courses-changed", onChanged);
    return () => window.removeEventListener("bulletin:courses-changed", onChanged);
  }, [load, submissionId]);

  if (hidden || !state) return null;

  const confirm = async () => {
    setConfirming(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/course-list`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setState(data);
        toast.success("Course list confirmed.");
      } else {
        toast.error("Couldn't confirm the course list", { description: data.error ?? "Please try again." });
      }
    } finally {
      setConfirming(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/course-list/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, courseCode, details }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Sent to DAP. You'll see their answer here.");
        setAsking(false);
        setCourseCode("");
        setDetails("");
        load();
      } else {
        toast.error("Couldn't send the request", { description: data.error ?? "Please try again." });
      }
    } finally {
      setSending(false);
    }
  };

  const { confirmation, requests } = state;
  const needsCode = kind !== "ADD" && kind !== "OTHER";
  const open = requests.filter((request) => request.status === "OPEN").length;

  return (
    <section aria-labelledby={`${submissionId}-course-list`} className="space-y-3 rounded-md border p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 id={`${submissionId}-course-list`} className="text-sm font-semibold">
            Course list confirmation
          </h3>
          {!confirmation ? (
            <p className="text-sm text-muted-foreground">
              Check the courses at every level, then confirm the list, or ask DAP for a change.
            </p>
          ) : confirmation.changedSince ? (
            <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Confirmed by {confirmation.confirmedBy ?? "someone"} on {formatDateTime(confirmation.confirmedAt)}, but the
              list has changed since. Confirm it again.
            </p>
          ) : (
            <p className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Confirmed by {confirmation.confirmedBy ?? "someone"} on {formatDateTime(confirmation.confirmedAt)} (
              {confirmation.courseCount} courses).
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canAsk && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAsking(true)}>
              <MessageSquarePlus className="mr-1 h-4 w-4" aria-hidden="true" />
              Ask DAP for a change
            </Button>
          )}
          {canConfirm && (!confirmation || confirmation.changedSince) && (
            <Button type="button" size="sm" onClick={() => void confirm()} disabled={confirming}>
              {confirming && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Confirm the course list
            </Button>
          )}
        </div>
      </div>

      {requests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Change requests{open > 0 ? ` (${open} waiting for DAP)` : ""}
          </p>
          <ul className="space-y-2">
            {requests.map((request) => (
              <li key={request.id} className="rounded-md bg-muted/40 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={request.status === "OPEN" ? "outline" : request.status === "DONE" ? "secondary" : "destructive"}>
                    {STATUS_LABELS[request.status] ?? request.status}
                  </Badge>
                  <span className="font-medium">
                    {KINDS[request.kind] ?? request.kind}
                    {request.courseCode ? `: ${request.courseCode}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {request.requestedBy ?? "Someone"}, {formatDateTime(request.requestedAt)}
                  </span>
                </div>
                <p className="mt-1">{request.details}</p>
                {request.response && <p className="mt-1 text-muted-foreground">DAP: {request.response}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={asking} onOpenChange={(next) => !sending && setAsking(next)}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <DialogHeader>
              <DialogTitle>Ask DAP to change the course list</DialogTitle>
              <DialogDescription>
                DAP sees your request in their queue and answers here. Changes to the Registry, such as
                units or a semester, are theirs to make.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>What should change?</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
                <SelectTrigger aria-label="What should change?">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KINDS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={codeId}>Course code{needsCode ? "" : " (if it has one)"}</Label>
              <Input id={codeId} value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="e.g. ECO 101" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={detailsId}>Details</Label>
              <Textarea
                id={detailsId}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="e.g. ECO 101 should be 3 units, as in the 2023-2027 bulletin."
              />
            </div>
            {needsCode && !courseCode.trim() && (
              <Alert>
                <AlertDescription>Say which course.</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAsking(false)} disabled={sending}>
                Cancel
              </Button>
              <Button type="submit" disabled={sending || details.trim().length < 10 || (needsCode && !courseCode.trim())}>
                {sending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Send to DAP
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
