"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SubmissionStatus } from "@prisma/client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarClock,
  CircleCheck,
  CircleX,
  Clock,
  FileText,
  GraduationCap,
  LibraryBig,
  MessageSquare,
  Plus,
  School,
  TriangleAlert,
  Undo2,
  Users,
} from "lucide-react";
import { useUser, usePermission } from "@/contexts/user-context";
import { getRoleDisplayName } from "@/lib/auth";
import { PHASE_NAMES } from "@/lib/submissions/phases";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/shared/states";
import { cn } from "@/lib/utils";

interface DashboardStats {
  submissions: {
    total: number;
    draft: number;
    correctionsRequired: number;
    inReview: number;
    approved: number;
    rejected: number;
  };
  phaseDistribution: Array<{ phase: number; name: string; count: number }>;
  recentActivity: Array<{
    id: string;
    action: string;
    fromPhase: number;
    toPhase: number;
    remarks: string | null;
    transitionedAt: string;
    submission: { id: string; title: string; programme: { name: string } };
    performedBy: { firstName: string; lastName: string; role: string };
  }>;
  openComments: number;
  actionRequired: {
    total: number;
    items: Array<{
      id: string;
      title: string;
      status: SubmissionStatus;
      currentPhase: number;
      updatedAt: string;
      programme: string;
      department: string;
    }>;
  };
  activeCycle: { id: string; name: string } | null;
  organization: {
    schools: number;
    departments: number;
    programmes: number;
    users: number;
  };
}

const ACTION_STYLES: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  SUBMIT: { label: "Submitted", icon: FileText, className: "bg-primary/10 text-primary" },
  APPROVE: {
    label: "Approved",
    icon: CircleCheck,
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  REJECT: {
    label: "Sent back for corrections",
    icon: CircleX,
    className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  },
  RETURN: {
    label: "Returned to previous phase",
    icon: Undo2,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  },
};

const STATUS_COLORS = {
  draft: "#94a3b8",
  inReview: "var(--primary)",
  correctionsRequired: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
}: {
  title: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "primary" | "warning" | "success";
  href?: string;
}) {
  const toneClass = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  }[tone];

  const body = (
    <Card className="h-full gap-0 py-0 transition-colors hover:border-primary/30">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );

  return href ? (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function DashboardPage() {
  const { currentUser, isLoading: userLoading } = useUser();
  const { hasPermission } = usePermission();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    fetch("/api/dashboard/stats")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((data: DashboardStats) => {
        if (!cancelled) {
          setStats(data);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser, reloadKey]);

  if (userLoading || (!stats && !failed)) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-64 animate-pulse rounded bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </div>
        <CardGridSkeleton />
      </div>
    );
  }

  if (!currentUser) return null;

  if (failed || !stats) {
    return (
      <ErrorState
        title="The dashboard couldn't be loaded"
        onRetry={() => {
          setFailed(false);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  const role = currentUser.role;
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const isHod = role === "HOD";
  const scope =
    currentUser.department?.name ?? currentUser.school?.name ?? "All schools";
  const submissionsHref = isHod ? "/submissions/me" : "/submissions";

  const statusData = [
    { name: "Draft", value: stats.submissions.draft, color: STATUS_COLORS.draft },
    { name: "In Review", value: stats.submissions.inReview, color: STATUS_COLORS.inReview },
    {
      name: "Corrections Required",
      value: stats.submissions.correctionsRequired,
      color: STATUS_COLORS.correctionsRequired,
    },
    { name: "Approved", value: stats.submissions.approved, color: STATUS_COLORS.approved },
    { name: "Rejected", value: stats.submissions.rejected, color: STATUS_COLORS.rejected },
  ];
  const hasSubmissions = stats.submissions.total > 0;

  const actionTitle = isHod ? "Needs your attention" : "Waiting for review";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting()}, ${currentUser.firstName}`}
        description={
          <>
            {getRoleDisplayName(role)} · {scope}
            {stats.activeCycle && <> · Active cycle: {stats.activeCycle.name}</>}
          </>
        }
        actions={
          <>
            {isHod && (
              <Button asChild variant="outline">
                <Link href="/submissions/me">
                  <FileText />
                  My submission
                </Link>
              </Button>
            )}
            {hasPermission("create:submission") && (
              <Button asChild>
                <Link href="/submissions/new">
                  <Plus />
                  New submission
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* Action required: only shown when something needs attention */}
      {stats.actionRequired.total > 0 && (
        <Card className="gap-0 overflow-hidden py-0">
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b px-5 py-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <TriangleAlert className="size-4 text-amber-600" />
                Action required
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                  {stats.actionRequired.total}
                </span>
              </CardTitle>
              <CardDescription>{actionTitle}</CardDescription>
            </div>
            {stats.actionRequired.total > stats.actionRequired.items.length && (
              <Button asChild variant="ghost" size="sm">
                <Link href={submissionsHref}>
                  View all <ArrowRight />
                </Link>
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {stats.actionRequired.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/submissions/${item.id}`}
                    className="flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.programme}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.department} · Phase {item.currentPhase}:{" "}
                        {PHASE_NAMES[item.currentPhase]}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        Updated {formatDate(item.updatedAt)}
                      </span>
                      <StatusBadge status={item.status} />
                      <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total submissions"
          value={stats.submissions.total}
          hint={isHod ? "In your department" : "Across your scope"}
          icon={FileText}
          href={submissionsHref}
        />
        <StatCard
          title="In review"
          value={stats.submissions.inReview}
          hint="Moving through the phases"
          icon={Clock}
          tone="primary"
        />
        <StatCard
          title="Corrections required"
          value={stats.submissions.correctionsRequired}
          hint="Returned to the department"
          icon={TriangleAlert}
          tone="warning"
        />
        <StatCard
          title="Approved"
          value={stats.submissions.approved}
          hint={`${stats.openComments} open comment${stats.openComments === 1 ? "" : "s"}`}
          icon={CircleCheck}
          tone="success"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Submissions by phase</CardTitle>
            <CardDescription>Where bulletins are in the 11-phase review</CardDescription>
          </CardHeader>
          <CardContent>
            {hasSubmissions ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.phaseDistribution} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="phase"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as { phase: number; count: number };
                      return (
                        <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                          <p className="font-medium">
                            Phase {d.phase}: {PHASE_NAMES[d.phase]}
                          </p>
                          <p className="text-muted-foreground">
                            {d.count} submission{d.count === 1 ? "" : "s"}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={FileText}
                title="No submissions yet"
                description="Submissions will appear here once departments start their bulletins."
                className="border-0"
              />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Status overview</CardTitle>
            <CardDescription>All submissions by status</CardDescription>
          </CardHeader>
          <CardContent>
            {hasSubmissions ? (
              <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
                <div className="h-[180px] w-[180px] shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData.filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {statusData
                          .filter((d) => d.value > 0)
                          .map((d) => (
                            <Cell key={d.name} fill={d.color} />
                          ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="w-full space-y-2 text-sm">
                  {statusData.map((d) => (
                    <li key={d.name} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: d.color }}
                          aria-hidden="true"
                        />
                        {d.name}
                      </span>
                      <span className="font-medium tabular-nums">{d.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <EmptyState
                title="Nothing to show yet"
                className="border-0"
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity + admin overview */}
      <div className={cn("grid gap-6", isAdmin && "lg:grid-cols-2")}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base">Recent activity</CardTitle>
              <CardDescription>Latest review decisions</CardDescription>
            </div>
            <MessageSquare className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats.recentActivity.length === 0 ? (
              <EmptyState title="No activity yet" className="border-0 py-8" />
            ) : (
              <ol className="space-y-4">
                {stats.recentActivity.map((activity) => {
                  const style = ACTION_STYLES[activity.action] ?? {
                    label: activity.action,
                    icon: Clock,
                    className: "bg-muted text-muted-foreground",
                  };
                  const Icon = style.icon;
                  return (
                    <li key={activity.id} className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          style.className,
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/submissions/${activity.submission.id}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {activity.submission.programme.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {style.label} by {activity.performedBy.firstName}{" "}
                          {activity.performedBy.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Phase {activity.fromPhase} → {activity.toPhase} ·{" "}
                          {formatDate(activity.transitionedAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organisation</CardTitle>
              <CardDescription>Records and shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {[
                { label: "Schools", value: stats.organization.schools, icon: School, href: "/academic-units" },
                { label: "Departments", value: stats.organization.departments, icon: Building2, href: "/academic-units" },
                { label: "Programmes", value: stats.organization.programmes, icon: GraduationCap, href: "/academic-units" },
                { label: "Active users", value: stats.organization.users, icon: Users, href: "/users" },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <item.icon className="size-5 text-primary" />
                  <div>
                    <p className="text-lg font-semibold leading-none tabular-nums">{item.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
                  </div>
                </Link>
              ))}
              <Link
                href="/master-courses"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <BookOpen className="size-5 text-primary" />
                <span className="text-sm font-medium">Master courses</span>
              </Link>
              <Link
                href="/bulletins"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <LibraryBig className="size-5 text-primary" />
                <span className="text-sm font-medium">Generate bulletins</span>
              </Link>
              <Link
                href="/review-cycles"
                className="col-span-2 flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <span className="flex items-center gap-3">
                  <CalendarClock className="size-5 text-primary" />
                  <span className="text-sm">
                    <span className="font-medium">Review cycles</span>
                    <span className="block text-xs text-muted-foreground">
                      {stats.activeCycle
                        ? `Active: ${stats.activeCycle.name}`
                        : "No cycle is active"}
                    </span>
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
