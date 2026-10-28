import type { SubmissionStatus } from "@prisma/client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASES, TOTAL_PHASES } from "@/lib/submissions/phases";

/**
 * Shows where a submission is in the 11 review phases.
 * Full stepper on wide screens; a compact bar with the current phase on small ones.
 */
export function PhaseTracker({
  currentPhase,
  status,
  className,
}: {
  currentPhase: number;
  status: SubmissionStatus;
  className?: string;
}) {
  const finished = status === "APPROVED";
  const needsCorrections = status === "CORRECTIONS_REQUIRED";
  const current = PHASES.find((p) => p.number === currentPhase);
  const percent = finished
    ? 100
    : Math.round(((currentPhase - 1) / (TOTAL_PHASES - 1)) * 100);

  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {finished ? (
            "All phases complete"
          ) : (
            <>
              Phase {currentPhase} of {TOTAL_PHASES}:{" "}
              <span className="text-primary">{current?.name}</span>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{percent}% through review</p>
      </div>

      {/* Compact bar (small screens) */}
      <div
        className="h-2 overflow-hidden rounded-full bg-muted md:hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Review progress"
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Stepper (wider screens) */}
      <ol className="hidden items-start md:flex" aria-label="Review phases">
        {PHASES.map((phase, index) => {
          const done = finished || phase.number < currentPhase;
          const active = !finished && phase.number === currentPhase;
          return (
            <li
              key={phase.number}
              className="relative flex flex-1 flex-col items-center"
              aria-current={active ? "step" : undefined}
            >
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2",
                    done || active ? "bg-primary" : "bg-border",
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 flex size-7 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  done && "border-primary bg-primary text-primary-foreground",
                  active &&
                    (needsCorrections
                      ? "border-amber-500 bg-amber-50 text-amber-800"
                      : "border-primary bg-card text-primary ring-4 ring-primary/15"),
                  !done && !active && "border-border bg-card text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : phase.number}
              </span>
              <span
                className={cn(
                  "mt-2 px-0.5 text-center text-[11px] leading-tight",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {phase.short}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
