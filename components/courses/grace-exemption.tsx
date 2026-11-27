"use client";

/**
 * Task F4: DAP can let a course past the GRACE gate with a reason (decision
 * DEC11). Everyone sees the exemption; only Academic Planning grants it or
 * takes it back.
 */
import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GRACE_OVERRIDE_REASON_LENGTH } from "@/lib/grace-config";
import { TRY_AGAIN } from "@/lib/messages";

export function GraceExemption({
  courseId,
  reason,
  canGrant,
  onChanged,
}: {
  courseId: string;
  reason: string | null;
  canGrant: boolean;
  onChanged: (reason: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { min, max } = GRACE_OVERRIDE_REASON_LENGTH;

  const send = async (method: "POST" | "DELETE") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}/grace-exemption`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" && { body: JSON.stringify({ reason: text }) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(method === "POST" ? "Couldn't record the exemption" : "Couldn't take it back", { description: body.error ?? TRY_AGAIN });
        return;
      }
      onChanged(method === "POST" ? text.trim() : null);
      setOpen(false);
      setText("");
    } finally {
      setBusy(false);
    }
  };

  if (reason) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <p className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">Exempted from GRACE by Academic Planning:</span> {reason}
          </span>
        </p>
        {canGrant && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void send("DELETE")}>
            Take back
          </Button>
        )}
      </div>
    );
  }
  if (!canGrant) return null;
  return open ? (
    <div className="space-y-2 rounded-md border p-3">
      <Textarea
        value={text}
        maxLength={max}
        onChange={(event) => setText(event.target.value)}
        placeholder="Why this course may go forward without passing GRACE"
        aria-label="Reason for the exemption from GRACE"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy || text.trim().length < min} onClick={() => void send("POST")}>
          {busy && <Loader2 className="animate-spin" />} Exempt from GRACE
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  ) : (
    <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
      <ShieldCheck /> DAP exemption from GRACE
    </Button>
  );
}
