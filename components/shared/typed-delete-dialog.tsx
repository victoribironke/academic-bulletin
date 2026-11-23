"use client";

/**
 * The one confirmation box for every delete (work order Q7, Appendix D).
 *
 * - The title names the thing ("Delete GST 112 from Estate Management?").
 * - The text says what goes with it and whether it can be restored.
 * - "Type DELETE to confirm": letter case and spaces at either end don't
 *   matter; anything else ("delet", "DELETED") keeps Delete switched off.
 * - Cancel has focus when the box opens; Escape cancels; Enter works only
 *   once the word matches. The red button says what it does.
 * - Several items at once: one confirmation, listing the first 10.
 */
import { type ReactNode, useCallback, useId, useRef, useState } from "react";
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

export const DELETE_WORD = "DELETE";

/** Same rule as the server (lib/archive.ts). */
export function typedDeleteMatches(typed: string): boolean {
  return typed.trim().toUpperCase() === DELETE_WORD;
}

export type TypedDeleteContent = {
  /** "Delete GST 112 from Estate Management?" */
  title: string;
  /** What goes, what goes with it, and whether it can be restored. */
  description: ReactNode;
  /** The red button: "Delete row", "Delete 12 rows", "Remove photo". */
  actionLabel: string;
  /** For several items at once: their names (the first 10 are listed). */
  items?: string[];
};

export function TypedDeleteDialog({
  open,
  content,
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  content: TypedDeleteContent | null;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const consequenceId = useId();
  const ready = typedDeleteMatches(typed);

  const items = content?.items ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent
        aria-describedby={consequenceId}
        onOpenAutoFocus={(event) => {
          // Each opening starts empty, with Cancel (not the box or the red
          // button) focused.
          setTyped("");
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        {content && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready && !busy) onConfirm();
            }}
          >
            <DialogHeader>
              <DialogTitle>{content.title}</DialogTitle>
              <DialogDescription id={consequenceId}>{content.description}</DialogDescription>
            </DialogHeader>
            {items.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {items.slice(0, 10).map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {items.length > 10 && <li className="list-none text-muted-foreground">and {items.length - 10} more</li>}
              </ul>
            )}
            <div className="space-y-2">
              <Label htmlFor={inputId}>Type {DELETE_WORD} to confirm</Label>
              <Input
                id={inputId}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={busy}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button ref={cancelRef} type="button" variant="outline" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={!ready || busy}>
                {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
                {content.actionLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * For removals that happen on the page and are saved afterwards (a course
 * row, a learning outcome): `confirmDelete(content)` opens the box and
 * resolves true once DELETE is typed, false on Cancel. Render `dialog` once.
 */
export function useConfirmDelete() {
  const [content, setContent] = useState<TypedDeleteContent | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const finish = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setContent(null);
  }, []);

  const confirmDelete = useCallback(
    (next: TypedDeleteContent) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setContent(next);
      }),
    [],
  );

  const dialog = (
    <TypedDeleteDialog
      open={content !== null}
      content={content}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    />
  );
  return { confirmDelete, dialog };
}
