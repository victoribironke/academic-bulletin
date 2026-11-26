"use client";

/**
 * Task H4: under a field's label, what good looks like, a live length
 * counter against the target, and "See an example" once DAP has chosen one.
 */
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { FIELD_HELP, type FieldKey, fieldExample, lengthLine, lengthStatus, measure } from "@/lib/help/field-help";

const STATUS_CLASS = {
  empty: "text-muted-foreground",
  short: "text-amber-700 dark:text-amber-400",
  good: "text-emerald-700 dark:text-emerald-400",
  long: "text-amber-700 dark:text-amber-400",
} as const;

export function FieldHelp({ field, value, showCounter = true }: { field: FieldKey; value: string | string[] | null | undefined; showCounter?: boolean }) {
  const help = FIELD_HELP[field];
  const example = fieldExample(field);
  const [open, setOpen] = useState(false);
  const exampleId = useId();
  const count = measure(value, help.target.unit);
  const status = lengthStatus(count, help.target);
  return (
    <div className="space-y-1 text-xs">
      <p className="text-muted-foreground">{help.good}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {showCounter && (
          <span className={cn("tabular-nums", STATUS_CLASS[status])} aria-live="polite">
            {lengthLine(count, help.target)}
          </span>
        )}
        {example && (
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline"
            aria-expanded={open}
            aria-controls={exampleId}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "Hide the example" : "See an example"}
          </button>
        )}
      </div>
      {example && open && (
        <div id={exampleId} className="rounded-md border bg-muted/40 p-2">
          <p className="mb-1 font-medium">From {example.programme} (2023-2027)</p>
          <p className="whitespace-pre-line text-muted-foreground">{example.text}</p>
        </div>
      )}
    </div>
  );
}
