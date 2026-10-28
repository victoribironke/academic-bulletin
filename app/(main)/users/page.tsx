"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, UserCheck, Users, UserX } from "lucide-react";
import { usePermission, useUser } from "@/contexts/user-context";
import { getRoleDisplayName } from "@/lib/auth";
import { Button } from "@/components/ui/button";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader } from "@/components/shared/page-header";
import { TableCard, TableToolbar } from "@/components/shared/table-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import { cn } from "@/lib/utils";

interface School {
  id: string;
  name: string;
  code: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
  schoolId: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "HOD" | "DEAN" | "ADMIN" | "SUPER_ADMIN";
  isActive: boolean;
  schoolId: string | null;
  departmentId: string | null;
  school?: School | null;
  department?: Department | null;
}

const ROLE_TIERS: Record<string, number> = {
  HOD: 1,
  DEAN: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

const ROLE_STYLES: Record<string, string> = {
  HOD: "border-border bg-muted text-foreground",
  DEAN: "border-primary/20 bg-primary/10 text-primary",
  ADMIN: "border-primary/30 bg-background text-primary",
  SUPER_ADMIN: "border-primary bg-primary text-primary-foreground",
};

function RolePill({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        ROLE_STYLES[role] ?? ROLE_STYLES.HOD,
      )}
    >
      {getRoleDisplayName(role as User["role"])}
    </span>
  );
}

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export default function UsersPage() {
  const router = useRouter();
  const { hasPermission } = usePermission();
  const { currentUser, isLoading: userLoading } = useUser();

  const [users, setUsers] = useState<User[] | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const canManage = hasPermission("manage:users");
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!userLoading && currentUser && !canManage) router.replace("/dashboard");
  }, [userLoading, currentUser, canManage, router]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/users/full"),
      fetch("/api/schools"),
      fetch("/api/departments"),
    ])
      .then(async ([usersRes, schoolsRes, deptsRes]) => {
        if (!usersRes.ok) throw new Error("users");
        const [u, s, d] = await Promise.all([
          usersRes.json(),
          schoolsRes.ok ? schoolsRes.json() : [],
          deptsRes.ok ? deptsRes.json() : [],
        ]);
        if (cancelled) return;
        setUsers(u);
        setSchools(s);
        setDepartments(d);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const visible = useMemo(() => {
    if (!users) return [];
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (filterRole !== "all" && u.role !== filterRole) return false;
      if (filterStatus === "active" && !u.isActive) return false;
      if (filterStatus === "inactive" && u.isActive) return false;
      if (!q) return true;
      return [u.firstName, u.lastName, u.email, u.department?.name, u.school?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [users, search, filterRole, filterStatus]);

  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const handleDelete = async (user: User) => {
    if (!isSuperAdmin) return;
    const ok = window.confirm(
      `Permanently delete ${user.firstName} ${user.lastName} (${user.email})? ` +
        "They will no longer be able to sign in. This can't be undone.",
    );
    if (!ok) return;

    setDeletingUserId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("User deleted");
        reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Couldn't delete this user", {
          description: data.error || "Please try again.",
        });
      }
    } catch {
      toast.error("Couldn't delete this user. Please try again.");
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleToggleActive = async (user: User) => {
    if (!isSuperAdmin) return;
    setTogglingUserId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (res.ok) {
        toast.success(user.isActive ? "User deactivated" : "User activated");
        reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update user status");
      }
    } catch {
      toast.error("Failed to update user status");
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleRoleChange = async (user: User, role: string) => {
    if (!canManage) return;
    setRoleUpdatingUserId(user.id);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        toast.success("Role updated");
        reload();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update role");
      }
    } catch {
      toast.error("Failed to update role");
    } finally {
      setRoleUpdatingUserId(null);
    }
  };

  if (!userLoading && currentUser && !canManage) return null;

  const activeCount = users?.filter((u) => u.isActive).length ?? 0;
  const inactiveCount = (users?.length ?? 0) - activeCount;
  const filtersActive =
    filterRole !== "all" || filterStatus !== "all" || search.trim() !== "";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Users"
        description="People who can sign in. Each person signs in with Google using the email added here."
        actions={
          canManage && (
            <CreateUserDialog
              schools={schools}
              departments={departments}
              isSuperAdmin={isSuperAdmin}
              onSuccess={reload}
            />
          )
        }
      />

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email or unit"
        filters={
          <>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-full bg-card sm:w-48" aria-label="Role">
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="HOD">{getRoleDisplayName("HOD")}</SelectItem>
                <SelectItem value="DEAN">{getRoleDisplayName("DEAN")}</SelectItem>
                <SelectItem value="ADMIN">{getRoleDisplayName("ADMIN")}</SelectItem>
                <SelectItem value="SUPER_ADMIN">{getRoleDisplayName("SUPER_ADMIN")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full bg-card sm:w-40" aria-label="Status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Deactivated</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
        actions={
          users && (
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <UserCheck className="size-4 text-emerald-600" />
                {activeCount} active
              </span>
              <span className="inline-flex items-center gap-1">
                <UserX className="size-4 text-destructive" />
                {inactiveCount} deactivated
              </span>
            </div>
          )
        }
      />

      {failed ? (
        <ErrorState onRetry={reload} />
      ) : !users ? (
        <TableSkeleton columns={5} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtersActive ? "No users match these filters" : "No users yet"}
          description={
            filtersActive
              ? "Try a different search or clear the filters."
              : "Add someone with “Create User”. They'll get an email telling them how to sign in."
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Unit</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((user) => {
                const canChangeRole =
                  canManage &&
                  !!currentUser &&
                  (isSuperAdmin ||
                    (ROLE_TIERS[currentUser.role] ?? 0) > (ROLE_TIERS[user.role] ?? 0));
                const unit = user.department?.name ?? user.school?.name;
                return (
                  <TableRow key={user.id} className={cn(!user.isActive && "text-muted-foreground")}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                            {initials(user.firstName, user.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {canChangeRole ? (
                        <Select
                          value={user.role}
                          onValueChange={(value) => handleRoleChange(user, value)}
                          disabled={roleUpdatingUserId === user.id}
                        >
                          <SelectTrigger
                            size="sm"
                            className="w-44 bg-card"
                            aria-label={`Role for ${user.firstName} ${user.lastName}`}
                          >
                            <SelectValue>
                              {roleUpdatingUserId === user.id ? (
                                "Updating..."
                              ) : (
                                <RolePill role={user.role} />
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="HOD">{getRoleDisplayName("HOD")}</SelectItem>
                            <SelectItem value="DEAN">{getRoleDisplayName("DEAN")}</SelectItem>
                            <SelectItem value="ADMIN">{getRoleDisplayName("ADMIN")}</SelectItem>
                            {isSuperAdmin && (
                              <SelectItem value="SUPER_ADMIN">
                                {getRoleDisplayName("SUPER_ADMIN")}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      ) : (
                        <RolePill role={user.role} />
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {unit ? (
                        <span className="text-sm">{unit}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className="size-2 rounded-full bg-muted-foreground/50" aria-hidden="true" />
                          Deactivated
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canManage && (
                          <EditUserDialog
                            user={user}
                            schools={schools}
                            departments={departments}
                            onSuccess={reload}
                          />
                        )}
                        {isSuperAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(user)}
                            disabled={togglingUserId === user.id}
                          >
                            {togglingUserId === user.id ? (
                              <Loader2 className="animate-spin" />
                            ) : user.isActive ? (
                              <UserX />
                            ) : (
                              <UserCheck />
                            )}
                            <span className="hidden sm:inline">
                              {user.isActive ? "Deactivate" : "Activate"}
                            </span>
                          </Button>
                        )}
                        {isSuperAdmin && user.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(user)}
                            disabled={deletingUserId === user.id}
                            aria-label={`Delete ${user.firstName} ${user.lastName}`}
                            title="Delete user"
                          >
                            {deletingUserId === user.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Trash2 />
                            )}
                          </Button>
                        )}
                      </div>
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
