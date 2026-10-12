"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useUser, usePermission } from "@/contexts/user-context";
import { getRoleDisplayName } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Plus,
  ArrowRight,
  Building2,
  GraduationCap,
  Users,
  School,
  MessageSquare,
  BookOpen,
  Calendar,
  Power,
} from "lucide-react";

import { Input } from "@/components/ui/input";

interface DashboardStats {
  submissions: {
    total: number;
    draft: number;
    correctionsRequired: number;
    inReview: number;
    approved: number;
    rejected: number;
  };
  phaseDistribution: Array<{
    phase: number;
    name: string;
    count: number;
  }>;
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
  organization: {
    schools: number;
    departments: number;
    programmes: number;
    users: number;
  };
}

// const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"];
const actionLabels: Record<string, string> = {
  SUBMIT: "Submitted",
  APPROVE: "Approved",
  REJECT: "Rejected",
  RETURN: "Returned",
};

export default function DashboardPage() {
  const { currentUser, isLoading: userLoading } = useUser();
  const { hasPermission } = usePermission();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cycles Management
  const [cycles, setCycles] = useState<
    { id: string; name: string; isActive: boolean; startedAt: string }[]
  >([]);
  const [isCreatingCycle, setIsCreatingCycle] = useState(false);
  const [newCycleName, setNewCycleName] = useState("");

  const fetchStats = useCallback(async () => {
    if (!currentUser) return;
    try {
      const url = new URL("/api/dashboard/stats", window.location.origin);
      if (currentUser.role === "HOD" && currentUser.departmentId) {
        url.searchParams.append("departmentId", currentUser.departmentId);
      } else if (currentUser.role === "DEAN" && currentUser.schoolId) {
        url.searchParams.append("schoolId", currentUser.schoolId);
      }
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  const fetchCycles = useCallback(async () => {
    try {
      const response = await fetch("/api/cycles");
      if (response.ok) {
        setCycles(await response.json());
      }
    } catch (err) {
      console.error("Failed to fetch cycles:", err);
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchStats();
      if (currentUser.role === "ADMIN" || currentUser.role === "SUPER_ADMIN") {
        fetchCycles();
      }
    } else if (!userLoading) {
      setIsLoading(false);
    }
  }, [currentUser, userLoading, fetchStats, fetchCycles]);

  const handleCreateCycle = async () => {
    if (!newCycleName.trim() || !currentUser) return;
    setIsCreatingCycle(true);
    try {
      const res = await fetch("/api/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCycleName,
        }),
      });
      if (res.ok) {
        setNewCycleName("");
        fetchCycles();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingCycle(false);
    }
  };

  const handleToggleCycle = async (id: string, currentActive: boolean) => {
    try {
      await fetch(`/api/cycles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      fetchCycles();
    } catch (e) {
      console.error(e);
    }
  };

  if (userLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Welcome to ABRMS</CardTitle>
            <CardDescription>
              Please select a user from the dropdown in the header to get
              started.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const statusPieData = stats
    ? [
      { name: "Draft", value: stats.submissions.draft, color: "#94a3b8" },
      {
        name: "Corrections Required",
        value: stats.submissions.correctionsRequired,
        color: "#f97316",
      },
      {
        name: "In Review",
        value: stats.submissions.inReview,
        color: "var(--primary)",
      },
      {
        name: "Approved",
        value: stats.submissions.approved,
        color: "#10b981",
      },
      {
        name: "Rejected",
        value: stats.submissions.rejected,
        color: "#ef4444",
      },
    ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome, {currentUser.firstName}!
          </h1>
          <p className="text-muted-foreground">
            You are logged in as{" "}
            <Badge variant="outline">
              {getRoleDisplayName(currentUser.role)}
            </Badge>
          </p>
        </div>
        {hasPermission("create:submission") && (
          <Link href="/submissions/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Submission
            </Button>
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Submissions
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.submissions.total || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all programmes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.submissions.inReview || 0}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting action</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.submissions.approved || 0}
            </div>
            <p className="text-xs text-muted-foreground">This cycle</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Comments</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.openComments || 0}</div>
            <p className="text-xs text-muted-foreground">Pending resolution</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Phase Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Phase Distribution</CardTitle>
            <CardDescription>Submissions by current phase</CardDescription>
          </CardHeader>
          <CardContent>
            {stats && stats.phaseDistribution.some((p) => p.count > 0) ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={stats.phaseDistribution}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="phase" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background border rounded p-2 shadow-lg">
                            <p className="font-medium">Phase {data.phase}</p>
                            <p className="text-sm text-muted-foreground">
                              {data.name}
                            </p>
                            <p className="text-sm">{data.count} submissions</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="var(--primary)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No submissions yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Status Overview</CardTitle>
            <CardDescription>Submissions by status</CardDescription>
          </CardHeader>
          <CardContent>
            {statusPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                No submissions yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest phase transitions</CardDescription>
            </div>
            <Link href="/submissions">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {stats && stats.recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {stats.recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div
                        className={`rounded-full p-2 ${activity.action === "APPROVE"
                          ? "bg-green-100"
                          : activity.action === "REJECT"
                            ? "bg-red-100"
                            : "bg-muted"
                          }`}
                      >
                        {activity.action === "APPROVE" ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : activity.action === "REJECT" ? (
                          <XCircle className="h-4 w-4 text-red-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/submissions/${activity.submission.id}`}
                          className="font-medium hover:underline truncate block"
                        >
                          {activity.submission.programme.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {actionLabels[activity.action] || activity.action} by{" "}
                          {activity.performedBy.firstName}{" "}
                          {activity.performedBy.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Phase {activity.fromPhase} → {activity.toPhase} •{" "}
                          {new Date(
                            activity.transitionedAt,
                          ).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No recent activity
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Organization Stats */}
        {(currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN") && (
          <Card>
            <CardHeader>
              <CardTitle>Organization Overview</CardTitle>
              <CardDescription>System data summary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Link href="/academic-units">
                  <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors">
                    <School className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-bold">
                        {stats?.organization.schools || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Schools</p>
                    </div>
                  </div>
                </Link>
                <Link href="/academic-units">
                  <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors">
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-bold">
                        {stats?.organization.departments || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Departments</p>
                    </div>
                  </div>
                </Link>
                <Link href="/academic-units">
                  <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors">
                    <GraduationCap className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-bold">
                        {stats?.organization.programmes || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Programmes</p>
                    </div>
                  </div>
                </Link>
                <Link href="/users">
                  <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors">
                    <Users className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="text-2xl font-bold">
                        {stats?.organization.users || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Active Users
                      </p>
                    </div>
                  </div>
                </Link>
                {(currentUser?.role === "ADMIN" ||
                  currentUser?.role === "SUPER_ADMIN" ||
                  currentUser?.role === "DEAN" ||
                  currentUser?.role === "HOD") && (
                    <Link href="/master-courses">
                      <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors col-span-2 md:col-span-1">
                        <BookOpen className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-bold">Master Courses</p>
                          <p className="text-sm text-muted-foreground">
                            Manage Registry
                          </p>
                        </div>
                      </div>
                    </Link>
                  )}

                {(currentUser?.role === "ADMIN" ||
                  currentUser?.role === "SUPER_ADMIN" ||
                  currentUser?.role === "DEAN") && (
                    <Link href="/bulletins">
                      <div className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted transition-colors col-span-2 md:col-span-1">
                        <BookOpen className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="text-lg font-bold">Academic Bulletins</p>
                          <p className="text-sm text-muted-foreground">
                            Generate Reports
                          </p>
                        </div>
                      </div>
                    </Link>
                  )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Admin Cycle Management */}
      {(currentUser?.role === "ADMIN" ||
        currentUser?.role === "SUPER_ADMIN") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Review Cycles Management
              </CardTitle>
              <CardDescription>
                Create and manage academic bulletin review cycles. Only one cycle
                can be active at a time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex gap-3">
                  <Input
                    placeholder="Cycle Name (e.g. 2024-2028 Academic Bulletin)"
                    value={newCycleName}
                    onChange={(e) => setNewCycleName(e.target.value)}
                    className="max-w-sm"
                  />
                  <Button
                    onClick={handleCreateCycle}
                    disabled={isCreatingCycle || !newCycleName.trim()}
                  >
                    {isCreatingCycle ? "Creating..." : "Start New Cycle"}
                  </Button>
                </div>

                {cycles.length > 0 ? (
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                          <th className="p-3 font-medium">Name</th>
                          <th className="p-3 font-medium">Status</th>
                          <th className="p-3 font-medium">Started At</th>
                          <th className="p-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cycles.map((cycle) => (
                          <tr
                            key={cycle.id}
                            className="border-b last:border-0 hover:bg-muted/50"
                          >
                            <td className="p-3 font-medium">{cycle.name}</td>
                            <td className="p-3">
                              {cycle.isActive ? (
                                <Badge className="bg-green-500">Active</Badge>
                              ) : (
                                <Badge variant="secondary">Closed</Badge>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {new Date(cycle.startedAt).toLocaleDateString()}
                            </td>
                            <td className="p-3 text-right">
                              <Button
                                variant={
                                  cycle.isActive ? "destructive" : "outline"
                                }
                                size="sm"
                                onClick={() =>
                                  handleToggleCycle(cycle.id, cycle.isActive)
                                }
                              >
                                <Power className="mr-2 h-3 w-3" />
                                {cycle.isActive ? "Close Cycle" : "Reopen Cycle"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground border-t pt-4">
                    No review cycles have been created yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
