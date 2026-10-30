"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SubmissionStatus } from "@prisma/client";
import { ArrowRight, FileText, MessageSquare } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { Progress } from "@/components/ui/progress";
import { TableCard, TableToolbar } from "@/components/shared/table-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { PHASE_NAMES, STATUS_LABELS } from "@/lib/submissions/phases";
import { cn } from "@/lib/utils";
import type { SubmissionProgress } from "@/lib/submissions/progress";

export interface SubmissionRow {
  id: string;
  title: string;
  currentPhase: number;
  status: SubmissionStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  programme: {
    id: string;
    name: string;
    code: string;
    department: {
      id: string;
      name: string;
      code: string;
      school: { id: string; name: string; code: string };
    };
  };
  createdBy: { id: string; firstName: string; lastName: string };
  _count: { comments: number; phaseTransitions: number };
  cycle: { id: string; name: string; isActive: boolean } | null;
  progress: SubmissionProgress;
}

interface Cycle {
  id: string;
  name: string;
  isActive: boolean;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Filterable, searchable table of submissions.
 * - `schoolId` limits results to one school (Deans).
 * - `highlightDepartmentId` pins and marks that department's programmes (HODs).
 * - `reloadKey` refetches when it changes (e.g. after creating drafts).
 * - `onCycleChange` reports the selected cycle to the parent page.
 */
export function SubmissionsList({
  schoolId,
  highlightDepartmentId,
  reloadKey = 0,
  onCycleChange,
  emptyDescription,
}: {
  schoolId?: string | null;
  highlightDepartmentId?: string | null;
  reloadKey?: number;
  onCycleChange?: (cycleId: string | null) => void;
  emptyDescription?: string;
}) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<SubmissionRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [filterCycle, setFilterCycle] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  const selectCycle = (value: string) => {
    setFilterCycle(value);
    onCycleChange?.(value === "all" ? null : value);
  };

  // Default the cycle filter to the active cycle.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cycles")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Cycle[]) => {
        if (cancelled) return;
        setCycles(data);
        const active = data.find((c) => c.isActive)?.id ?? null;
        setFilterCycle(active ?? "all");
        onCycleChange?.(active);
      })
      .catch(() => {
        if (!cancelled) setFilterCycle("all");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (filterCycle === null) return;
    const params = new URLSearchParams();
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterPhase !== "all") params.set("phase", filterPhase);
    if (filterCycle !== "all") params.set("cycleId", filterCycle);
    if (schoolId) params.set("schoolId", schoolId);

    let cancelled = false;
    fetch(`/api/submissions?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: SubmissionRow[]) => {
        if (cancelled) return;
        setSubmissions(data);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, filterStatus, filterPhase, filterCycle, reloadKey, retryKey]);

  const visible = useMemo(() => {
    if (!submissions) return [];
    const q = search.trim().toLowerCase();
    const matches = q
      ? submissions.filter((s) =>
          [
            s.programme.name,
            s.programme.code,
            s.programme.department.name,
            s.programme.department.code,
            s.programme.department.school.name,
          ]
            .join(" ")
            .toLowerCase()
            .includes(q),
        )
      : submissions;
    if (!highlightDepartmentId) return matches;
    // Own department first, otherwise keep the server's order.
    return [...matches].sort(
      (a, b) =>
        Number(b.programme.department.id === highlightDepartmentId) -
        Number(a.programme.department.id === highlightDepartmentId),
    );
  }, [submissions, search, highlightDepartmentId]);

  const filtersActive =
    filterStatus !== "all" || filterPhase !== "all" || search.trim() !== "";

  return (
    <div className="space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search programme, department or school"
        filters={
          <>
            <Select value={filterCycle ?? "all"} onValueChange={selectCycle}>
              <SelectTrigger className="w-full bg-card sm:w-56" aria-label="Review cycle">
                <SelectValue placeholder="All cycles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cycles</SelectItem>
                {cycles.map((cycle) => (
                  <SelectItem key={cycle.id} value={cycle.id}>
                    {cycle.name}
                    {cycle.isActive && " (active)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full bg-card sm:w-48" aria-label="Status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPhase} onValueChange={setFilterPhase}>
              <SelectTrigger className="w-full bg-card sm:w-56" aria-label="Phase">
                <SelectValue placeholder="All phases" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All phases</SelectItem>
                {Object.entries(PHASE_NAMES).map(([num, name]) => (
                  <SelectItem key={num} value={num}>
                    {num}. {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        actions={
          submissions && (
            <span className="text-sm text-muted-foreground">
              {visible.length} of {submissions.length} submission
              {submissions.length === 1 ? "" : "s"}
            </span>
          )
        }
      />

      {failed ? (
        <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />
      ) : !submissions ? (
        <TableSkeleton columns={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filtersActive ? "No submissions match these filters" : "No submissions yet"}
          description={
            filtersActive
              ? "Try a different search or clear the filters."
              : emptyDescription
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>Programme</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Cycle</TableHead>
                <TableHead className="hidden sm:table-cell">Comments</TableHead>
                <TableHead className="hidden lg:table-cell">Updated</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((submission) => {
                const isOwn =
                  !!highlightDepartmentId &&
                  submission.programme.department.id === highlightDepartmentId;
                return (
                  <TableRow
                    key={submission.id}
                    className={cn(
                      "cursor-pointer",
                      isOwn && "bg-primary/5 hover:bg-primary/10",
                    )}
                    onClick={() => router.push(`/submissions/${submission.id}`)}
                  >
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/submissions/${submission.id}`}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {submission.programme.name}
                        </Link>
                        {isOwn && (
                          <Badge className="px-1.5 py-0 text-[10px]">Your programme</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {submission.programme.department.name} ·{" "}
                        {submission.programme.department.school.code}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">Phase {submission.currentPhase}</p>
                      <p className="text-xs text-muted-foreground">
                        {PHASE_NAMES[submission.currentPhase]}
                      </p>
                    </TableCell>
                    <TableCell className="min-w-44">
                      <StatusBadge status={submission.status} />
                      <div
                        className="mt-2 space-y-1"
                        title={submission.progress.sections
                          .map((section) => `${section.label}: ${section.percentage}%`)
                          .join("\n")}
                      >
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-muted-foreground">Content progress</span>
                          <span className="font-medium tabular-nums">
                            {submission.progress.percentage}%
                          </span>
                        </div>
                        <Progress
                          value={submission.progress.percentage}
                          aria-label={`${submission.progress.percentage}% of bulletin content completed`}
                          className="h-1.5"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {submission.progress.completedSections} of{" "}
                          {submission.progress.totalSections} sections complete
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm">{submission.cycle?.name ?? "—"}</span>
                      {submission.cycle?.isActive && (
                        <Badge variant="secondary" className="ml-2 px-1.5 py-0 text-[10px] font-normal">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <MessageSquare className="size-4" />
                        {submission._count.comments}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatDate(submission.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </div>
  );
}
