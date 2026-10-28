import type { SubmissionStatus } from "@prisma/client";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/submissions/phases";

const STATUS_STYLES: Record<
  SubmissionStatus,
  { className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  DRAFT: {
    className: "border-border bg-muted text-muted-foreground",
    icon: CircleDashed,
  },
  IN_REVIEW: {
    className: "border-primary/20 bg-primary/10 text-primary",
    icon: Clock,
  },
  CORRECTIONS_REQUIRED: {
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300",
    icon: TriangleAlert,
  },
  APPROVED: {
    className:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300",
    icon: CircleCheck,
  },
  REJECTED: {
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: CircleX,
  },
};

/** Colour-coded pill for a submission's status. */
export function StatusBadge({
  status,
  className,
}: {
  status: SubmissionStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT;
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        style.className,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
