"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePermission, useUser } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import {
  FileText,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  ArrowLeft,
} from "lucide-react";

interface Submission {
  id: string;
  title: string;
  currentPhase: number;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";
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
}

interface Cycle {
  id: string;
  name: string;
  isActive: boolean;
}

const phaseNames: Record<number, string> = {
  1: "Preparation",
  2: "Departmental Review",
  3: "School Approval",
  4: "Academic Planning Review",
  5: "Corrections",
  6: "Final Consolidation",
  7: "Senate Approval",
  8: "Editing",
  9: "Typesetting",
  10: "Distribution",
  11: "Post-Release",
};

const statusConfig = {
  DRAFT: { label: "Draft", variant: "outline" as const, icon: Clock },
  IN_REVIEW: {
    label: "In Review",
    variant: "default" as const,
    icon: AlertCircle,
  },
  APPROVED: {
    label: "Approved",
    variant: "default" as const,
    icon: CheckCircle,
  },
  REJECTED: {
    label: "Rejected",
    variant: "destructive" as const,
    icon: XCircle,
  },
};

export default function SubmissionsBrowsePage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPhase, setFilterPhase] = useState<string>("all");
  const [filterCycle, setFilterCycle] = useState<string>("all");
  const { hasPermission } = usePermission();
  const { currentUser, isLoading: userLoading } = useUser();

  const canView = hasPermission("view:submissions");

  const fetchCycles = async () => {
    try {
      const res = await fetch("/api/cycles");
      if (res.ok) {
        const data = await res.json();
        setCycles(data);
        const activeCycle = data.find((c: Cycle) => c.isActive);
        if (activeCycle) setFilterCycle(activeCycle.id);
      }
    } catch (e) {
      console.error("Failed to fetch cycles:", e);
    }
  };

  const fetchSubmissions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterPhase !== "all") params.set("phase", filterPhase);
      if (filterCycle !== "all") params.set("cycleId", filterCycle);
      const url = `/api/submissions${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);
      if (response.ok) setSubmissions(await response.json());
    } catch (err) {
      console.error("Failed to fetch submissions:", err);
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus, filterPhase, filterCycle]);

  useEffect(() => {
    fetchCycles();
  }, []);

  useEffect(() => {
    if (userLoading) return;
    if (!currentUser) {
      router.replace("/");
      return;
    }
    if (!canView) {
      router.replace("/dashboard");
      return;
    }
    if (currentUser.role !== "HOD") {
      router.replace("/submissions");
      return;
    }
    setIsLoading(true);
    fetchSubmissions();
  }, [userLoading, currentUser, canView, router, fetchSubmissions]);

  const sortedSubmissions = [...submissions].sort((a, b) => {
    if (currentUser?.departmentId) {
      const aIsOwn = a.programme.department.id === currentUser.departmentId;
      const bIsOwn = b.programme.department.id === currentUser.departmentId;
      if (aIsOwn && !bIsOwn) return -1;
      if (!aIsOwn && bIsOwn) return 1;
    }
    return 0;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (userLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (currentUser.role !== "HOD") {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Redirecting…
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading submissions…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/submissions/me" aria-label="Back to your submission">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              All programme submissions
            </h1>
            <p className="text-muted-foreground">
              View other departments&apos; submissions (read-only). Your own
              programme is listed first.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">Review Cycle:</Label>
              <Select value={filterCycle} onValueChange={setFilterCycle}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All Cycles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cycles</SelectItem>
                  {cycles.map((cycle) => (
                    <SelectItem key={cycle.id} value={cycle.id}>
                      {cycle.name} {cycle.isActive && "(Active)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">Status:</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="IN_REVIEW">In Review</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">Phase:</Label>
              <Select value={filterPhase} onValueChange={setFilterPhase}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Phases</SelectItem>
                  {Object.entries(phaseNames).map(([num, name]) => (
                    <SelectItem key={num} value={num}>
                      Phase {num}: {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="ml-auto text-sm text-muted-foreground">
              {sortedSubmissions.length} submission
              {sortedSubmissions.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Submissions
          </CardTitle>
          <CardDescription>
            Open any row to view; you can only edit your department&apos;s
            programme.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedSubmissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No submissions match these filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Programme</TableHead>
                  <TableHead>Review Cycle</TableHead>
                  <TableHead>Phase</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Comments</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedSubmissions.map((submission) => {
                  const StatusIcon = statusConfig[submission.status].icon;
                  const isOwnDept =
                    currentUser.departmentId ===
                    submission.programme.department.id;
                  return (
                    <TableRow
                      key={submission.id}
                      className={
                        isOwnDept
                          ? "bg-primary/5 border-l-2 border-l-primary"
                          : ""
                      }
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium flex items-center gap-2">
                            {submission.programme.name}
                            {isOwnDept && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                              >
                                Your programme
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {submission.programme.department.school.code} /{" "}
                            {submission.programme.department.code}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          {submission.cycle?.name || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          Phase {submission.currentPhase}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {phaseNames[submission.currentPhase]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusConfig[submission.status].variant}
                          className={
                            submission.status === "APPROVED"
                              ? "bg-green-500"
                              : undefined
                          }
                        >
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusConfig[submission.status].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MessageSquare className="h-4 w-4" />
                          {submission._count.comments}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(submission.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/submissions/${submission.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
