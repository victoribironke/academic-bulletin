"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePermission } from "@/contexts/user-context";
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
  Plus,
  FileText,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
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
      school: {
        id: string;
        name: string;
        code: string;
      };
    };
  };
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  _count: {
    comments: number;
    phaseTransitions: number;
  };
  cycle: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
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

export default function SubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPhase, setFilterPhase] = useState<string>("all");
  const [filterCycle, setFilterCycle] = useState<string>("all");
  const { hasPermission } = usePermission();

  const canCreate = hasPermission("create:submission");

  const fetchCycles = async () => {
    try {
      const res = await fetch("/api/cycles");
      if (res.ok) {
        const data = await res.json();
        setCycles(data);
        const activeCycle = data.find((c: Cycle) => c.isActive);
        if (activeCycle) {
          setFilterCycle(activeCycle.id);
        }
      }
    } catch (e) {
      console.error("Failed to fetch cycles:", e);
    }
  };

  useEffect(() => {
    fetchCycles();
  }, []);

  const fetchSubmissions = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterPhase !== "all") params.set("phase", filterPhase);
      if (filterCycle !== "all") params.set("cycleId", filterCycle);

      const url = `/api/submissions${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setSubmissions(data);
      }
    } catch (err) {
      console.error("Failed to fetch submissions:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [filterStatus, filterPhase, filterCycle]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading submissions...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
          <p className="text-muted-foreground">
            Manage academic bulletin submissions
          </p>
        </div>
        {canCreate && (
          <Link href="/submissions/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Submission
            </Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="filter-cycle" className="whitespace-nowrap">
                Review Cycle:
              </Label>
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
              <Label htmlFor="filter-status" className="whitespace-nowrap">
                Status:
              </Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Statuses" />
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
              <Label htmlFor="filter-phase" className="whitespace-nowrap">
                Phase:
              </Label>
              <Select value={filterPhase} onValueChange={setFilterPhase}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Phases" />
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
            <div className="ml-auto flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                {submissions.length} submission
                {submissions.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submissions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            All Submissions
          </CardTitle>
          <CardDescription>
            Click on a submission to view details and manage review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No submissions found.{" "}
              {canCreate && (
                <Link
                  href="/submissions/new"
                  className="text-primary hover:underline"
                >
                  Create your first submission
                </Link>
              )}
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
                {submissions.map((submission) => {
                  const StatusIcon = statusConfig[submission.status].icon;
                  return (
                    <TableRow key={submission.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {submission.programme.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {submission.programme.department.school.code} /{" "}
                            {submission.programme.department.code}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm font-medium">
                            {submission.cycle?.name || "—"}
                          </span>
                          {submission.cycle?.isActive && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 font-normal"
                            >
                              Active
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">
                            Phase {submission.currentPhase}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {phaseNames[submission.currentPhase]}
                          </span>
                        </div>
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
