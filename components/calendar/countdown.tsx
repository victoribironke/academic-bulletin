"use client";

/**
 * Countdowns (work order tasks C2 and C3, and the basic "My desk" of T1).
 * One look everywhere: the big line ("70 days left"), the due date, the next
 * checkpoint and working days, and the status in words and colour.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import type { Countdown, DeadlineStatus } from "@/lib/calendar/countdown";
import type { PhaseListRow } from "@/lib/calendar/desk";
import { cn } from "@/lib/utils";
import { WaitingWork } from "@/components/desk/waiting-work";
import { AgentMessages } from "@/components/desk/agent-messages";
import { ClinicsCard } from "@/components/desk/clinics-card";
import { ContinueWhereStopped } from "@/components/desk/continue-where-stopped";
import { Progress } from "@/components/ui/progress";
import { useUser } from "@/contexts/user-context";

type ProgrammeDeadline = {
  submissionId: string;
  programme: { name: string; code: string; isNew: boolean };
  phase: number;
  status: string;
  countdown: Countdown | null;
  /** G1: honest progress (G5), and the first section still to finish. */
  progress?: { percentage: number; completedSections: number; totalSections: number; next: string | null } | null;
};

export type Deadlines = {
  cycle: { id: string; name: string } | null;
  desk?: Countdown | null;
  programmes?: ProgrammeDeadline[];
  phases?: PhaseListRow[];
  programme?: Countdown | null;
};

// One request per page for the bar and the panel together.
let pending: { at: number; promise: Promise<Deadlines | null> } | null = null;
function fetchDeadlines(submissionId?: string): Promise<Deadlines | null> {
  const load = () =>
    fetch(`/api/calendar/desk${submissionId ? `?submissionId=${encodeURIComponent(submissionId)}` : ""}`)
      .then((response) => (response.ok ? (response.json() as Promise<Deadlines>) : null))
      .catch(() => null);
  if (submissionId) return load();
  if (!pending || Date.now() - pending.at > 60_000) pending = { at: Date.now(), promise: load() };
  return pending.promise;
}

export function useDeadlines(submissionId?: string): Deadlines | null {
  const [deadlines, setDeadlines] = useState<Deadlines | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchDeadlines(submissionId).then((data) => {
      if (!cancelled) setDeadlines(data);
    });
    return () => {
      cancelled = true;
    };
  }, [submissionId]);
  return deadlines;
}

const STATUS_STYLES: Record<DeadlineStatus, string> = {
  ON_TRACK: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
  KEEP_AN_EYE: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
  AT_RISK: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  OVERDUE: "border-red-800 bg-red-800 text-white dark:border-red-400 dark:bg-red-900",
};

/** Status in words and colour; never colour alone. */
export function DeadlineStatusPill({ countdown, className }: { countdown: Countdown; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_STYLES[countdown.status],
        className,
      )}
      title={countdown.statusReason}
    >
      {countdown.statusLabel}
      {countdown.statusReason && <span className="sr-only">. {countdown.statusReason}</span>}
    </span>
  );
}

/** The slim bar at the top of every page (task C3). */
export function CountdownBar() {
  const deadlines = useDeadlines();
  const desk = deadlines?.desk;
  if (!desk) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted/40 px-4 py-1.5 text-xs md:px-6"
      role="status"
      aria-label="Your deadline"
    >
      <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="font-medium">{desk.label}:</span>
      <span className="font-semibold">{desk.headline}</span>
      <span className="text-muted-foreground">· {desk.extendedLine ?? desk.dueLine}</span>
      <DeadlineStatusPill countdown={desk} />
    </div>
  );
}

/** The large countdown (home page, task C2). */
export function CountdownCard({ countdown, title }: { countdown: Countdown; title?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title ?? countdown.label}
          </p>
          <p className="mt-1 text-3xl font-semibold leading-tight">{countdown.headline}</p>
          <p className="mt-1 text-sm text-muted-foreground">{countdown.dueLine}</p>
          {countdown.extendedLine && <p className="text-sm font-medium">{countdown.extendedLine}</p>}
        </div>
        <DeadlineStatusPill countdown={countdown} className="text-xs" />
      </div>
      <p className="mt-3 text-sm">
        {[countdown.nextLine, countdown.workingDaysLine].filter(Boolean).join(" · ")}
      </p>
      {/* T2: the reason for the status, in words. */}
      {countdown.statusReason && <p className="mt-1 text-sm text-muted-foreground">{countdown.statusReason}</p>}
    </div>
  );
}

/** One programme's deadline, in its header next to the phase steps. */
export function ProgrammeCountdown({ submissionId }: { submissionId: string }) {
  const deadlines = useDeadlines(submissionId);
  const countdown = deadlines?.programme;
  if (!countdown) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-card px-4 py-2 text-sm">
      <CalendarClock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="font-medium">{countdown.label}:</span>
      <span className="font-semibold">{countdown.headline}</span>
      <span className="text-muted-foreground">· {countdown.extendedLine ?? countdown.dueLine}</span>
      {countdown.nextLine && <span className="text-muted-foreground">· {countdown.nextLine}</span>}
      <DeadlineStatusPill countdown={countdown} />
    </div>
  );
}

/** The home page panel: your deadline, then the programmes or phases you look after. */
export function DeadlinesPanel() {
  const deadlines = useDeadlines();
  const { currentUser } = useUser();
  if (!deadlines?.cycle) return null;
  const { desk, programmes, phases } = deadlines;
  return (
    <section className="space-y-3" aria-label="Deadlines">
      {desk && <CountdownCard countdown={desk} title={`Your deadline: ${desk.label}`} />}
      {/* G1: straight back to the last section opened in this browser. */}
      {currentUser && <ContinueWhereStopped userId={currentUser.id} />}
      {/* T1: the desk's own waiting work, with "Do this next". */}
      <WaitingWork />
      {/* T3: the reminder agent's messages, in the app as well as by email. */}
      <AgentMessages />
      {/* H8: the next clinics with DAP, for Heads of Department and coordinators. */}
      <ClinicsCard />

      {programmes && programmes.length > 0 && (
        <div className="rounded-lg border bg-card">
          <p className="border-b px-4 py-2 text-sm font-medium">Programmes and their deadlines</p>
          <ul className="divide-y">
            {programmes.map((item) => (
              <li key={item.submissionId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span className="min-w-0 space-y-1">
                <Link href={`/submissions/${item.submissionId}`} className="font-medium hover:underline">
                  {item.programme.name}
                  {item.programme.isNew && (
                    <span className="ml-2 rounded border border-brand-gold/50 bg-brand-gold/10 px-1.5 py-0.5 text-[11px] font-medium">
                      New programme
                    </span>
                  )}
                </Link>
                {item.progress && (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Progress value={item.progress.percentage} className="h-1.5 w-24" aria-label={`${item.programme.name}: ${item.progress.percentage}% done`} />
                    {item.progress.completedSections} of {item.progress.totalSections} sections done
                    {item.progress.next && (
                      <Link href={`/submissions/${item.submissionId}?section=${item.progress.next}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                        Continue
                      </Link>
                    )}
                  </span>
                )}
                </span>
                <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <span>
                    Phase {item.phase} · {item.status}
                  </span>
                  {item.countdown && (
                    <>
                      <span className="font-medium text-foreground">{item.countdown.headline}</span>
                      <DeadlineStatusPill countdown={item.countdown} />
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {phases && (
        <div className="rounded-lg border bg-card">
          <p className="border-b px-4 py-2 text-sm font-medium">{deadlines.cycle.name}: the ten phases</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Phase</th>
                  <th className="px-4 py-2 font-medium">Opens</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium">Days left</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {phases.map((phase) => (
                  <tr key={phase.phase}>
                    <td className="px-4 py-2">
                      {phase.phase}. {phase.name}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{phase.opens ?? "After the Senate vote"}</td>
                    <td className="px-4 py-2">
                      {phase.due ?? "Worked out from the Senate vote"}
                      {phase.hardStop && <span className="ml-1 text-xs text-muted-foreground">(fixed)</span>}
                    </td>
                    <td className="px-4 py-2">
                      {phase.daysLeft === null
                        ? "-"
                        : phase.daysLeft > 0
                          ? phase.daysLeft
                          : phase.daysLeft === 0
                            ? "Due today"
                            : "Passed"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
