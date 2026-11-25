"use client";

/**
 * Task H8: the clinics card on the Head of Department home page. The next
 * two online clinics with DAP and their joining links, until the clinics end
 * (Friday, January 29, 2027). DAP sets them on the cycle's Calendar screen.
 */
import { useEffect, useState } from "react";
import { ExternalLink, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/contexts/user-context";
import { formatLongDate } from "@/lib/calendar/dates";
import { isSafeJoinUrl } from "@/lib/calendar/clinic-sessions";
import type { HomeClinics } from "@/lib/calendar/clinics";

const STATUS_LABEL = { ON_NOW: "On now", SOON: "Starting soon" } as const;

export function ClinicsCard() {
  const { currentUser } = useUser();
  const departmental = currentUser?.role === "HOD" || currentUser?.role === "PROGRAMME_COORDINATOR";
  const [clinics, setClinics] = useState<HomeClinics | null>(null);

  useEffect(() => {
    if (!departmental) return;
    let cancelled = false;
    fetch("/api/calendar/clinics")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: HomeClinics | null) => {
        if (!cancelled && data && Array.isArray(data.sessions)) setClinics(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [departmental]);

  if (!departmental || !clinics || clinics.sessions.length === 0) return null;
  return (
    <section className="rounded-lg border bg-card" aria-label="Clinics with Academic Planning">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Video className="size-4 text-muted-foreground" aria-hidden />
          Clinics with Academic Planning
        </p>
        {clinics.until && <span className="text-xs text-muted-foreground">Until {formatLongDate(clinics.until)}</span>}
      </div>
      <ul className="divide-y">
        {clinics.sessions.map((session) => (
          <li key={`${session.clinicId}:${session.date}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{session.day}</span>, {session.time}
              <span className="text-muted-foreground"> · {session.title}</span>
              {session.status !== "LATER" && (
                <span className="ml-2 rounded border border-emerald-600/40 bg-emerald-600/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  {STATUS_LABEL[session.status]}
                </span>
              )}
            </span>
            {isSafeJoinUrl(session.joinUrl) && (
              <Button asChild size="sm" variant={session.status === "LATER" ? "outline" : "default"}>
                <a href={session.joinUrl} target="_blank" rel="noopener noreferrer">
                  Join <ExternalLink />
                </a>
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="border-t px-4 py-2 text-xs text-muted-foreground">
        {clinics.schedule.join("; ")}, West Africa Time. Bring any question about your draft; no booking needed.
      </p>
    </section>
  );
}
