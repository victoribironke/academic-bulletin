"use client";

import { useState, useEffect, useMemo } from "react";
import { usePermission, useUser } from "@/contexts/user-context";
import { useRouter } from "next/navigation";
import { getRoleDisplayName } from "@/lib/auth";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, UserCheck, UserX, Loader2 } from "lucide-react";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import { toast } from "sonner";

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
  role: "HOD" | "DEAN" | "ADMIN";
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

function getRoleTier(role: string): number {
  return ROLE_TIERS[role] ?? 0;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<string>("all");
  const { hasPermission } = usePermission();
  const { currentUser } = useUser();

  const canManage = hasPermission("manage:users");
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !canManage) {
      router.replace("/dashboard");
    }
  }, [isLoading, canManage, router]);

  const fetchData = async () => {
    try {
      const [usersRes, schoolsRes, deptsRes] = await Promise.all([
        fetch("/api/users/full"),
        fetch("/api/schools"),
        fetch("/api/departments"),
      ]);

      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
      if (schoolsRes.ok) {
        setSchools(await schoolsRes.json());
      }
      if (deptsRes.ok) {
        const data = await deptsRes.json();
        setDepartments(data);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleActive = async (user: User) => {
    if (!isSuperAdmin) return;

    setTogglingUserId(user.id);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !user.isActive }),
      });

      if (response.ok) {
        await fetchData();
        toast.success(
          user.isActive ? "User deactivated" : "User activated",
        );
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Failed to update user status");
      }
    } catch (err) {
      console.error("Failed to toggle user status:", err);
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleRoleChange = async (user: User, newRole: string) => {
    if (!canManage) return;

    setRoleUpdatingUserId(user.id);
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        await fetchData();
        toast.success("User role updated");
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error || "Failed to update user role");
      }
    } catch (err) {
      console.error("Failed to update user role:", err);
    } finally {
      setRoleUpdatingUserId(null);
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "ADMIN":
        return "destructive";
      case "DEAN":
        return "default";
      case "HOD":
        return "secondary";
      default:
        return "outline";
    }
  };

  const filteredUsers =
    filterRole === "all" ? users : users.filter((u) => u.role === filterRole);

  const userTable = useMemo(() => (
    filteredUsers.length === 0 ? (
      <div className="text-center py-8 text-muted-foreground">
        No users found matching the filter.
      </div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>School</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredUsers.map((user) => (
            <TableRow
              key={user.id}
              className={!user.isActive ? "opacity-50" : ""}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {getInitials(user.firstName, user.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {user.email}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {canManage &&
                (isSuperAdmin ||
                  getRoleTier(currentUser!.role) > getRoleTier(user.role)) ? (
                  <Select
                    value={user.role}
                    onValueChange={(value) =>
                      handleRoleChange(user, value)
                    }
                    disabled={roleUpdatingUserId === user.id}
                  >
                    <SelectTrigger className="w-40 cursor-pointer [&>span]:truncate">
                      <SelectValue>
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {roleUpdatingUserId === user.id ? "Updating..." : user.role.split("_").join(" ")}
                        </Badge>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HOD">
                        {getRoleDisplayName("HOD")}
                      </SelectItem>
                      <SelectItem value="DEAN">
                        {getRoleDisplayName("DEAN")}
                      </SelectItem>
                      <SelectItem value="ADMIN">
                        {getRoleDisplayName("ADMIN")}
                      </SelectItem>
                      {isSuperAdmin && (
                        <SelectItem value="SUPER_ADMIN">
                          Super Admin
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={getRoleBadgeVariant(user.role)}>
                    {user.role.split("_").join(" ")}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {user.school ? (
                  <Badge variant="outline" className="truncate max-w-[150px]">{user.school.code}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {user.department ? (
                  <Badge variant="outline" className="truncate max-w-[150px]">{user.department.code}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {user.isActive ? (
                  <Badge variant="default" className="bg-green-500">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {canManage && (
                    <EditUserDialog
                      user={user}
                      schools={schools}
                      departments={departments}
                      onSuccess={fetchData}
                    />
                  )}
                  {isSuperAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(user)}
                      disabled={togglingUserId === user.id}
                      className="cursor-pointer"
                    >
                    {togglingUserId === user.id ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : user.isActive ? (
                      <>
                        <UserX className="mr-1 h-4 w-4" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <UserCheck className="mr-1 h-4 w-4" />
                        Activate
                      </>
                    )}
                  </Button>
                )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [filteredUsers, canManage, isSuperAdmin, currentUser, togglingUserId, roleUpdatingUserId, schools, departments]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    );
  }

  // Optional: Return null since the useEffect will handle the redirect
  if (!canManage) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            Manage user accounts and roles
          </p>
        </div>
        {canManage && (
          <CreateUserDialog
            schools={schools}
            departments={departments}
            isSuperAdmin={isSuperAdmin}
            onSuccess={fetchData}
          />
        )}
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Filter by Role:</span>
              <Select value={filterRole} onValueChange={setFilterRole}>
                <SelectTrigger className="w-48 [&>span]:truncate">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="HOD">Head of Department</SelectItem>
                  <SelectItem value="DEAN">Dean</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4 ml-auto text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <UserCheck className="h-4 w-4 text-green-500" />
                {users.filter((u) => u.isActive).length} Active
              </div>
              <div className="flex items-center gap-1">
                <UserX className="h-4 w-4 text-red-500" />
                {users.filter((u) => !u.isActive).length} Inactive
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Users
          </CardTitle>
          <CardDescription>
            {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}{" "}
            found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userTable}
        </CardContent>
      </Card>
    </div>
  );
}
