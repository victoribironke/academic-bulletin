"use client";

/**
 * Task U3: after a delete, an "Undo" link for 10 seconds. It puts back what
 * this person just deleted, from the Archive.
 */
import { toast } from "sonner";
import { TRY_AGAIN } from "@/lib/messages";

export function offerUndo(message: string, entityType: "COURSE_ROW" | "STAFF", entityIds: string[], onRestored: () => void) {
  if (entityIds.length === 0) return;
  toast(message, {
    duration: 10_000,
    action: {
      label: "Undo",
      onClick: async () => {
        const res = await fetch("/api/archive/undo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityIds }),
        }).catch(() => null);
        const body = res ? await res.json().catch(() => ({})) : {};
        if (!res?.ok) {
          toast.error("Couldn't undo that", { description: body.error ?? TRY_AGAIN });
          return;
        }
        toast.success(body.restored === 1 ? "Put back" : `Put back ${body.restored}`);
        onRestored();
      },
    },
  });
}
