"use client";

/**
 * Tasks D9 and B6: the GRACE check on a Registry course's shared text, from
 * Courses We Own. The General Education desk (DAP) runs it for GST, BU-GST
 * and ENT; owning departments for their own courses. One result serves
 * every draft with the same text.
 */
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TRY_AGAIN } from "@/lib/messages";

type GraceSummary = {
  status: "NOT_CHECKED" | "NO_TEXT" | "PENDING" | "CHECKING" | "COMPLIANT" | "NEEDS_REVISION" | "ERROR";
  explanation?: string | null;
  recommendation?: string | null;
  error?: string | null;
};

const LABEL: Record<GraceSummary["status"], string> = {
  NOT_CHECKED: "Not checked yet",
  NO_TEXT: "No course content saved yet",
  PENDING: "Waiting for a check",
  CHECKING: "Being checked",
  COMPLIANT: "Meets GRACE",
  NEEDS_REVISION: "Needs revision",
  ERROR: "The check didn't complete",
};

export function RegistryGrace({ courseId, canRun, dirty }: { courseId: string; canRun: boolean; dirty: boolean }) {
  const [grace, setGrace] = useState<GraceSummary | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/courses-we-own/${courseId}/grace`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setGrace(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const run = async () => {
    setRunning(true);
    try {
      const res = await fetch(`/api/courses-we-own/${courseId}/grace`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setGrace(data);
      else toast.error("The GRACE check didn't run", { description: data.error ?? TRY_AGAIN });
    } finally {
      setRunning(false);
    }
  };

  if (!grace) return null;
  const tone =
    grace.status === "COMPLIANT"
      ? "text-emerald-700 dark:text-emerald-400"
      : grace.status === "NEEDS_REVISION" || grace.status === "ERROR"
        ? "text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-medium">GRACE</span>
          <span className={tone}>{LABEL[grace.status]}</span>
        </p>
        {canRun && grace.status !== "NO_TEXT" && (
          <Button type="button" size="sm" variant="outline" onClick={() => void run()} disabled={running || dirty}>
            {running && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {grace.status === "COMPLIANT" || grace.status === "NEEDS_REVISION" ? "Check again" : "Check with GRACE"}
          </Button>
        )}
      </div>
      {dirty && canRun && <p className="text-xs text-muted-foreground">Save first: GRACE checks the saved text.</p>}
      {grace.status === "NEEDS_REVISION" && grace.recommendation && <p className="text-xs text-muted-foreground">{grace.recommendation}</p>}
      {grace.status === "ERROR" && grace.error && <p className="text-xs text-muted-foreground">{grace.error}</p>}
    </div>
  );
}
