"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Mail, Trash2, UserCheck, Users, UserX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useDeleteRecord } from "@/components/shared/delete-record-dialog";
import { TableCard, TableToolbar } from "@/components/shared/table-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import {
  TablePagination,
  useClientPagination,
} from "@/components/shared/table-pagination";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { ResetTwoStepDialog } from "@/components/users/reset-two-step-dialog";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import {
  formatExceptionDate,
  hasActiveException,
  SignInExceptionDialog,
} from "@/components/users/sign-in-exception-dialog";
import { isPrivilegedRole, isUniversityEmail } from "@/lib/sign-in-access";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates/format";

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

interface Programme {
  id: string;
  name: string;
  code: string;
  departmentId: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role:
    | "PROGRAMME_COORDINATOR"
    | "HOD"
    | "DEAN"
    | "ADMIN"
    | "SUPER_ADMIN";
  isActive: boolean;
  signInExceptionUntil: string | null;
  signInExceptionReason: string | null;
  signInExceptionGrantedBy: { firstName: string; lastName: string } | null;
  mfaEnabledAt: string | null;
  invitedAt: string | null;
  firstSignInAt: string | null;
  lastActiveAt: string | null;
  schoolId: string | null;
  departmentId: string | null;
  school?: School | null;
  department?: Department | null;
  programmes?: Programme[];
}

const ROLE_TIERS: Record<string, number> = {
  PROGRAMME_COORDINATOR: 1,
  HOD: 2,
  DEAN: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
};

const ROLE_STYLES: Record<string, string> = {
  PROGRAMME_COORDINATOR: "border-brand-gold/40 bg-brand-gold/10 text-foreground",
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

/** Says when a personal (non-university) account can sign in. */
function PersonalAccountNote({ user }: { user: User }) {
  if (isUniversityEmail(user.email)) return null;
  const [text, tone] = isPrivilegedRole(user.role)
    ? ["Personal account · can't sign in as an admin", "text-destructive"]
    : hasActiveException(user)
      ? [
          `Personal account · exception until ${formatExceptionDate(user.signInExceptionUntil!)}`,
          "text-amber-700 dark:text-amber-400",
        ]
      : ["Personal account · can't sign in without an exception", "text-destructive"];
  return <p className={cn("truncate text-xs", tone)}>{text}</p>;
}

/** Whether the account has its authenticator app set up (everyone, DEC18). */
function TwoStepNote({ user }: { user: User }) {
  return user.mfaEnabledAt ? (
    <p className="truncate text-xs text-emerald-700 dark:text-emerald-400">
      Two-step verification on
    </p>
  ) : (
    <p className="truncate text-xs text-amber-700 dark:text-amber-400">
      Sets up two-step verification at next sign-in
    </p>
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
  const [programmes, setProgrammes] = useState<Programme[]>([]);
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
      fetch("/api/programmes"),
    ])
      .then(async ([usersRes, schoolsRes, deptsRes, programmesRes]) => {
        if (!usersRes.ok) throw new Error("users");
        const [u, s, d, p] = await Promise.all([
          usersRes.json(),
          schoolsRes.ok ? schoolsRes.json() : [],
          deptsRes.ok ? deptsRes.json() : [],
          programmesRes.ok ? programmesRes.json() : [],
        ]);
        if (cancelled) return;
        setUsers(u);
        setSchools(s);
        setDepartments(d);
        setProgrammes(p);
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
      // D3: who hasn't signed in yet, for DAP's daily list.
      if (filterStatus === "not-signed-in" && (u.firstSignInAt || !u.isActive)) return false;
      if (!q) return true;
      return [u.firstName, u.lastName, u.email, u.department?.name, u.school?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [users, search, filterRole, filterStatus]);
  const pagination = useClientPagination(
    visible,
    `${search}|${filterRole}|${filterStatus}`,
  );

  const { requestDelete, dialog: deleteDialog, checkingUrl } = useDeleteRecord();
  const deletingUserId = checkingUrl?.split("/").pop() ?? null;
  const handleDelete = (user: User) => {
    if (!isSuperAdmin) return;
    requestDelete({
      url: `/api/users/${user.id}`,
      noun: "user",
      name: `${user.firstName} ${user.lastName} (${user.email})`,
      permanent: true,
      onDeleted: reload,
    });
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

  // Coordinators need a department and programmes, so picking that role
  // from the table opens the Edit dialog instead of saving straight away.
  const [coordinatorTarget, setCoordinatorTarget] = useState<User | null>(null);

  const handleRoleChange = async (user: User, role: string) => {
    if (!canManage) return;
    if (role === "PROGRAMME_COORDINATOR") {
      setCoordinatorTarget(user);
      return;
    }
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
      {coordinatorTarget && (
        <EditUserDialog
          key={coordinatorTarget.id}
          user={coordinatorTarget}
          schools={schools}
          departments={departments}
          programmes={programmes}
          canChangeRole
          allowSuperAdmin={isSuperAdmin}
          initialRole="PROGRAMME_COORDINATOR"
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setCoordinatorTarget(null);
          }}
          onSuccess={() => {
            setCoordinatorTarget(null);
            toast.success("Role updated");
            reload();
          }}
        />
      )}
      <PageHeader
        title="Users"
        description="People who can sign in. Each person signs in with Google using the email added here."
        actions={
          canManage && (
            <div className="flex flex-wrap items-center gap-2">
            <SendInvitationsButton
              waiting={
                users?.filter(
                  (u) => u.isActive && !u.invitedAt && INVITED_ROLES.includes(u.role),
                ).length ?? 0
              }
              onSent={reload}
            />
            <CreateUserDialog
              schools={schools}
              departments={departments}
              programmes={programmes}
              isSuperAdmin={isSuperAdmin}
              onSuccess={reload}
            />
            </div>
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
                <SelectItem value="PROGRAMME_COORDINATOR">
                  {getRoleDisplayName("PROGRAMME_COORDINATOR")}
                </SelectItem>
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
                <SelectItem value="not-signed-in">Not signed in yet</SelectItem>
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
        <>
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
              {pagination.pageItems.map((user) => {
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
                          <PersonalAccountNote user={user} />
                          <TwoStepNote user={user} />
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
                            <SelectItem value="PROGRAMME_COORDINATOR">
                              {getRoleDisplayName("PROGRAMME_COORDINATOR")}
                            </SelectItem>
                            <SelectItem value="HOD">{getRoleDisplayName("HOD")}</SelectItem>
                            <SelectItem value="DEAN">{getRoleDisplayName("DEAN")}</SelectItem>
                            {/* Admin roles need a babcock.edu.ng account. */}
                            <SelectItem value="ADMIN" disabled={!isUniversityEmail(user.email)}>
                              {getRoleDisplayName("ADMIN")}
                            </SelectItem>
                            {isSuperAdmin && (
                              <SelectItem
                                value="SUPER_ADMIN"
                                disabled={!isUniversityEmail(user.email)}
                              >
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
                      {/* D3: invited, first sign-in, last active. */}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {user.firstSignInAt
                          ? `Signed in ${formatDate(user.firstSignInAt)}${user.lastActiveAt ? ` · last active ${formatDate(user.lastActiveAt)}` : ""}`
                          : user.invitedAt
                            ? `Invited ${formatDate(user.invitedAt)} · not signed in yet`
                            : "Not signed in yet"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {canManage && (
                          <EditUserDialog
                            user={user}
                            schools={schools}
                            departments={departments}
                            programmes={programmes}
                            canChangeRole={canChangeRole}
                            allowSuperAdmin={isSuperAdmin}
                            onSuccess={reload}
                          />
                        )}
                        {isSuperAdmin &&
                          !isUniversityEmail(user.email) &&
                          !isPrivilegedRole(user.role) && (
                            <SignInExceptionDialog user={user} onSuccess={reload} />
                          )}
                        {canManage && user.isActive && INVITED_ROLES.includes(user.role) && (
                          <InviteButton userId={user.id} invited={Boolean(user.invitedAt)} onSent={reload} />
                        )}
                        {/* D11: a DAP officer resets a Head, coordinator or Dean; a Super Administrator anyone. */}
                        {(isSuperAdmin || (canManage && !isPrivilegedRole(user.role))) &&
                          user.mfaEnabledAt &&
                          user.id !== currentUser?.id && (
                          <ResetTwoStepDialog user={user} onSuccess={reload} />
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
        <TablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={pagination.setPage}
          noun="users"
        />
        </>
      )}
      {deleteDialog}
    </div>
  );
}

/** D3: the roles that get an invitation. */
const INVITED_ROLES: string[] = ["HOD", "PROGRAMME_COORDINATOR", "DEAN"];


/** Sends one person's invitation, or sends it again. */
function InviteButton({ userId, invited, onSent }: { userId: string; invited: boolean; onSent: () => void }) {
  const [sending, setSending] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={sending}
      onClick={async () => {
        setSending(true);
        try {
          const response = await fetch(`/api/users/${userId}/invite`, { method: "POST" });
          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            toast.success(`Invitation sent to ${data.email}.`);
            onSent();
          } else {
            toast.error(data.error ?? "The invitation wasn't sent.");
          }
        } finally {
          setSending(false);
        }
      }}
    >
      {sending ? <Loader2 className="animate-spin" /> : <Mail />}
      <span className="hidden sm:inline">{invited ? "Resend invitation" : "Send invitation"}</span>
    </Button>
  );
}

/** Sends every waiting invitation at once, after a confirmation. */
function SendInvitationsButton({ waiting, onSent }: { waiting: number; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  // D3: DAP can hold the invitations; while held, nothing goes out.
  const [hold, setHold] = useState<{ held: boolean; reason: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/invitations")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data?.hold) setHold(data.hold);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [waiting]);
  if (waiting === 0 && !hold?.held) return null;
  const held = Boolean(hold?.held);

  const setHeld = async (next: boolean) => {
    const response = await fetch("/api/invitations", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hold: next }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast.error(data.error ?? "The change wasn't saved.");
      return false;
    }
    setHold(data.hold);
    return true;
  };

  const send = async () => {
    const response = await fetch("/api/invitations", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const failed = (data.results ?? []).filter((result: { sent: boolean }) => !result.sent).length;
      toast.success(`${data.sent} invitation${data.sent === 1 ? "" : "s"} sent.`, {
        description: failed ? `${failed} could not be sent; see the Activity Log.` : undefined,
      });
      setOpen(false);
      onSent();
    } else {
      toast.error(data.error ?? "The invitations weren't sent.");
    }
  };

  const run = async (work: () => Promise<unknown>) => {
    setSending(true);
    try {
      await work();
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Mail />
        {held ? `Invitations on hold (${waiting} waiting)` : `Send waiting invitations (${waiting})`}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !sending && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {held ? "The invitations are on hold" : `Send ${waiting} invitation${waiting === 1 ? "" : "s"} now?`}
            </DialogTitle>
            <DialogDescription>
              {held
                ? `Nobody gets an invitation until you release the hold: not with the daily job, not from here.${hold?.reason ? ` Reason: ${hold.reason}` : ""} ${waiting} ${waiting === 1 ? "person is" : "people are"} waiting.`
                : "Each Head of Department, programme coordinator and Dean who hasn't had one gets their invitation email now. Otherwise the daily job sends them at 7:00 am WAT. You can hold them instead."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
              Cancel
            </Button>
            {held ? (
              <>
                <Button variant="outline" disabled={sending} onClick={() => void run(async () => (await setHeld(false)) && toast.success("Released: they go out with the next daily run."))}>
                  Release the hold
                </Button>
                {waiting > 0 && (
                  <Button disabled={sending} onClick={() => void run(async () => (await setHeld(false)) && (await send()))}>
                    {sending && <Loader2 className="animate-spin" />}
                    Release and send {waiting} now
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" disabled={sending} onClick={() => void run(async () => (await setHeld(true)) && toast.success("Held: no invitation goes out until you release it."))}>
                  Hold them
                </Button>
                <Button disabled={sending} onClick={() => void run(send)}>
                  {sending && <Loader2 className="animate-spin" />}
                  Send {waiting} now
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
