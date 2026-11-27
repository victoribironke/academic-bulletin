"use client";

/**
 * Task G8: a Head with several programmes copies a section's saved words to
 * the department's other programmes, then adjusts each one there.
 */
import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { COPYABLE_SECTIONS } from "@/lib/submissions/copy-section";
import { TRY_AGAIN } from "@/lib/messages";

type Programme = { id: string; name: string; hasWords: boolean; canWrite: boolean };

export function CopySection({ submissionId, section, beforeCopy }: { submissionId: string; section: string; beforeCopy: () => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [programmes, setProgrammes] = useState<Programme[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const spec = COPYABLE_SECTIONS[section];
  if (!spec) return null;

  const load = async () => {
    setProgrammes(null);
    setChosen(new Set());
    const res = await fetch(`/api/submissions/${submissionId}/copy-section?section=${section}`).catch(() => null);
    if (res?.ok) setProgrammes((await res.json()).programmes);
    else setProgrammes([]);
  };

  const copy = async () => {
    setBusy(true);
    try {
      // The words copied are the saved ones: save what is on the page first.
      if (!(await beforeCopy())) return;
      const res = await fetch(`/api/submissions/${submissionId}/copy-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, targetIds: [...chosen] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't copy the section", { description: body.error ?? TRY_AGAIN });
        return;
      }
      toast.success(`Copied to ${body.copied.join(", ")}`, { description: "Open each programme to adjust its words." });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const replacing = programmes?.filter((item) => chosen.has(item.id) && item.hasWords) ?? [];
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        <Copy className="h-4 w-4" /> Copy to other programmes
      </Button>
      <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy {spec.title} to other programmes</DialogTitle>
            <DialogDescription>
              The words in this section are copied to the programmes you tick, in your department. Adjust them there afterwards. Total units,
              the minimum CGPA and photos are not copied.
            </DialogDescription>
          </DialogHeader>
          {programmes === null ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Finding your other programmes…
            </p>
          ) : programmes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your department has no other programme in this cycle.</p>
          ) : (
            <ul className="space-y-2">
              {programmes.map((programme) => (
                <li key={programme.id} className="flex items-start gap-2">
                  <Checkbox
                    id={`copy-${programme.id}`}
                    checked={chosen.has(programme.id)}
                    disabled={!programme.canWrite}
                    onCheckedChange={(state) =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (state === true) next.add(programme.id);
                        else next.delete(programme.id);
                        return next;
                      })
                    }
                  />
                  <Label htmlFor={`copy-${programme.id}`} className="font-normal leading-snug">
                    {programme.name}
                    <span className="block text-xs text-muted-foreground">
                      {!programme.canWrite ? "You can't edit it now." : programme.hasWords ? "Already has words here: they will be replaced." : "Empty here."}
                    </span>
                  </Label>
                </li>
              ))}
            </ul>
          )}
          {replacing.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              This replaces the {spec.title} already written for {replacing.map((item) => item.name).join(", ")}.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void copy()} disabled={busy || chosen.size === 0}>
              {busy && <Loader2 className="animate-spin" />} Copy to {chosen.size || ""} {chosen.size === 1 ? "programme" : "programmes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
