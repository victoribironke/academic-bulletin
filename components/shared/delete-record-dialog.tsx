"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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

export type DeleteRequest = {
  /** The record's DELETE endpoint, e.g. /api/schools/abc. */
  url: string;
  /** What the record is, e.g. "school". */
  noun: string;
  /** What it's called, shown in the dialog. */
  name: string;
  /** Deleting erases it, rather than moving it to the Archive. */
  permanent?: boolean;
  onDeleted?: () => void;
};

type State =
  | { step: "closed" }
  | { step: "checking"; request: DeleteRequest }
  | {
      step: "confirm";
      request: DeleteRequest;
      confirmText: string;
      typed: string;
      error: string | null;
      deleting: boolean;
    }
  | { step: "blocked"; request: DeleteRequest; error: string; reasons: string[] };

const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const matches = (typed: string, expected: string) =>
  normalize(typed) !== "" && normalize(typed) === normalize(expected);

function sendDelete(url: string, confirm?: string) {
  return fetch(url, {
    method: "DELETE",
    ...(confirm !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm }),
    }),
  });
}

/**
 * Deleting with a typed confirmation. `requestDelete` first asks the server
 * whether the record can go: if something still uses it, the dialog says what;
 * otherwise it asks for the record's name before deleting. Render `dialog`
 * once in the page.
 */
export function useDeleteRecord() {
  const [state, setState] = useState<State>({ step: "closed" });

  const done = (request: DeleteRequest) => {
    setState({ step: "closed" });
    toast.success(
      request.permanent
        ? `${request.name} was deleted.`
        : `${request.name} was deleted. An administrator can restore it from the Archive.`,
    );
    request.onDeleted?.();
  };

  const requestDelete = useCallback(async (request: DeleteRequest) => {
    setState({ step: "checking", request });
    try {
      // Without a typed name the server only checks; it deletes nothing.
      const res = await sendDelete(request.url);
      const data = await res.json().catch(() => ({}));
      if (res.status === 400 && data.code === "CONFIRMATION_REQUIRED") {
        setState({
          step: "confirm",
          request,
          confirmText: typeof data.confirmText === "string" ? data.confirmText : request.name,
          typed: "",
          error: null,
          deleting: false,
        });
      } else if (res.status === 409) {
        setState({
          step: "blocked",
          request,
          error: data.error ?? `This ${request.noun} can't be deleted.`,
          reasons: Array.isArray(data.reasons) ? data.reasons : [],
        });
      } else if (res.ok) {
        done(request);
      } else {
        setState({ step: "closed" });
        toast.error(`Couldn't delete this ${request.noun}`, {
          description: data.error ?? "Please try again.",
        });
      }
    } catch {
      setState({ step: "closed" });
      toast.error(`Couldn't delete this ${request.noun}. Please try again.`);
    }
  }, []);

  const confirmDelete = async () => {
    if (state.step !== "confirm" || state.deleting) return;
    if (!matches(state.typed, state.confirmText)) return;
    const { request, typed } = state;
    setState({ ...state, deleting: true, error: null });
    try {
      const res = await sendDelete(request.url, typed);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        done(request);
      } else if (res.status === 409) {
        setState({
          step: "blocked",
          request,
          error: data.error ?? `This ${request.noun} can't be deleted.`,
          reasons: Array.isArray(data.reasons) ? data.reasons : [],
        });
      } else {
        setState((current) =>
          current.step === "confirm"
            ? { ...current, deleting: false, error: data.error ?? "Please try again." }
            : current,
        );
      }
    } catch {
      setState((current) =>
        current.step === "confirm"
          ? { ...current, deleting: false, error: "Couldn't reach the server. Please try again." }
          : current,
      );
    }
  };

  const close = () => {
    if (state.step === "confirm" && state.deleting) return;
    setState({ step: "closed" });
  };

  const dialog = (
    <Dialog
      open={state.step === "confirm" || state.step === "blocked"}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        {state.step === "blocked" && (
          <>
            <DialogHeader>
              <DialogTitle>This {state.request.noun} can&apos;t be deleted</DialogTitle>
              <DialogDescription>{state.error}</DialogDescription>
            </DialogHeader>
            {state.reasons.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {state.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
        {state.step === "confirm" && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmDelete();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {state.request.permanent ? "Permanently delete" : "Delete"}{" "}
                {state.request.noun}?
              </DialogTitle>
              <DialogDescription>
                {state.request.permanent ? (
                  <>
                    This permanently deletes <strong>{state.request.name}</strong>. It
                    can&apos;t be undone.
                  </>
                ) : (
                  <>
                    <strong>{state.request.name}</strong> will be moved to the Archive.
                    An administrator can restore it from Administration, Archive.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">
                Type <span className="font-semibold">{state.confirmText}</span> to
                confirm
              </Label>
              <Input
                id="delete-confirmation"
                autoFocus
                autoComplete="off"
                value={state.typed}
                disabled={state.deleting}
                onChange={(event) => {
                  const typed = event.target.value;
                  setState((current) =>
                    current.step === "confirm" ? { ...current, typed, error: null } : current,
                  );
                }}
              />
              {state.error && <p className="text-sm text-destructive">{state.error}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={state.deleting}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={state.deleting || !matches(state.typed, state.confirmText)}
              >
                {state.deleting && <Loader2 className="animate-spin" />}
                Delete
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );

  return {
    requestDelete,
    dialog,
    /** The URL being checked, so the page can show a spinner on that row. */
    checkingUrl: state.step === "checking" ? state.request.url : null,
  };
}
