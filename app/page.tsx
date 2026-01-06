"use client";

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
import { FileText, Clock, CheckCircle, AlertCircle } from "lucide-react";

export default function DashboardPage() {
  const { currentUser, isLoading } = useUser();
  const { hasPermission } = usePermission();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
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

  return (
    <div className="space-y-6">
      {/* Welcome header */}
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

      {/* Stats cards - placeholder data */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Submissions
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">
              Across all programmes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Awaiting action</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">This cycle</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Needs Attention
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Overdue or rejected</p>
          </CardContent>
        </Card>
      </div>

      {/* Permissions debug info - helpful during development */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Permissions</CardTitle>
          <CardDescription>
            Based on your role: {currentUser.role}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {hasPermission("create:submission") && (
              <Badge>Create Submissions</Badge>
            )}
            {hasPermission("review:submission") && (
              <Badge variant="secondary">Review Submissions</Badge>
            )}
            {hasPermission("approve:submission") && (
              <Badge variant="secondary">Approve Submissions</Badge>
            )}
            {hasPermission("manage:programmes") && (
              <Badge variant="outline">Manage Programmes</Badge>
            )}
            {hasPermission("manage:departments") && (
              <Badge variant="outline">Manage Departments</Badge>
            )}
            {hasPermission("manage:schools") && (
              <Badge variant="outline">Manage Schools</Badge>
            )}
            {hasPermission("manage:users") && (
              <Badge variant="destructive">Manage Users</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
