"use client";

/**
 * Task G3: one way to save. Everything saves as you type; this says where
 * the saving stands, e.g. "Saved at 10:42 am".
 */
import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { formatTime } from "@/lib/dates/format";

export type SaveState = "idle" | "pending" | "saving" | "saved" | "error" | "offline" | "incomplete";

export function SaveStatus({ state, savedAt, note }: { state: SaveState; savedAt: Date | null; note?: string }) {
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {state === "saving" && (
        <>
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          Saving…
        </>
      )}
      {state === "pending" && <span>Saving shortly…</span>}
      {state === "saved" && savedAt && (
        <>
          <Cloud className="size-3 text-green-600" aria-hidden="true" />
          <span className="text-green-700 dark:text-green-400">Saved at {formatTime(savedAt)}</span>
        </>
      )}
      {state === "idle" && savedAt && <span>Saved at {formatTime(savedAt)}</span>}
      {state === "offline" && (
        <>
          <CloudOff className="size-3" aria-hidden="true" />
          Offline: kept on this device
        </>
      )}
      {state === "error" && (
        <>
          <CloudOff className="size-3 text-red-600" aria-hidden="true" />
          <span className="text-red-700 dark:text-red-400">{note ?? "Not saved yet. Trying again…"}</span>
        </>
      )}
      {state === "incomplete" && <span className="text-amber-700 dark:text-amber-400">{note ?? "Finish the row to save it"}</span>}
    </span>
  );
}
