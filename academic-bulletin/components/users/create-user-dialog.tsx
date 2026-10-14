"use client";

import { useActionState, useState, useEffect } from "react";
import { adminCreateUser } from "@/app/actions/admin";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, CircleCheck, Copy, Check } from "lucide-react";

export function CreateUserDialog({
  schools,
  departments,
  isSuperAdmin = false,
  onSuccess,
}: {
  schools: { id: string; name: string }[];
  departments: { id: string; name: string; schoolId: string }[];
  isSuperAdmin?: boolean;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<string>("none");
  const [selectedDepartment, setSelectedDepartment] =
    useState<string>("none");
  const [selectedRole, setSelectedRole] = useState<string>("HOD");
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [state, formAction, isPending] = useActionState(adminCreateUser, null);

  useEffect(() => {
    if (state && "success" in state && state.success) {
      setInvitedEmail(state.email);
      if (state.inviteLink) {
        setInviteLink(state.inviteLink);
        toast.success("User created", {
          description: "Copy the invite link below to share with the user.",
        });
      } else {
        toast.success("Invitation sent", {
          description: `Login instructions were sent to ${state.email}.`,
        });
      }
      onSuccess?.();
    } else if (state && "error" in state && state.error) {
      toast.error("Failed to create user", { description: state.error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const handleCopy = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success("Invite link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setInvitedEmail(null);
      setInviteLink(null);
      setCopied(false);
      setSelectedSchool("none");
      setSelectedDepartment("none");
      setSelectedRole("HOD");
    }
  };

  const filteredDepartments =
    selectedSchool !== "none"
      ? departments.filter((d) => d.schoolId === selectedSchool)
      : [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        {invitedEmail ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CircleCheck className="h-5 w-5 text-green-500" />
                {inviteLink ? "User Created" : "Invitation Sent"}
              </DialogTitle>
              <DialogDescription>
                {inviteLink
                  ? `User account was created for ${invitedEmail}. Direct email delivery is not configured, so please copy the invite link below and share it with the user.`
                  : `Login instructions were sent directly to ${invitedEmail}. The recipient can use the email link to set their password.`}
              </DialogDescription>
            </DialogHeader>

            {inviteLink && (
              <div className="space-y-3">
                <Label>Invite Link</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={inviteLink}
                    className="flex-1 font-mono text-xs"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={handleCopy}
                    title="Copy invite link"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This single-use link allows the user to set their password.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user and send password setup instructions directly to
                their email address.
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" name="firstName" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" name="lastName" required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="user@university.edu"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">System Role</Label>
                <input type="hidden" name="role" value={selectedRole} />
                <Select
                  value={selectedRole}
                  onValueChange={(role) => {
                    setSelectedRole(role);
                    setSelectedSchool("none");
                    setSelectedDepartment("none");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOD">Head of Department (HOD)</SelectItem>
                    <SelectItem value="DEAN">Dean</SelectItem>
                    <SelectItem value="ADMIN">Academic Planning Admin</SelectItem>
                    {isSuperAdmin && (
                      <SelectItem value="SUPER_ADMIN">
                        Super Administrator
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {(selectedRole === "HOD" || selectedRole === "DEAN") && (
              <div className="space-y-2">
                <Label htmlFor="schoolId">School</Label>
                <Select
                  name="schoolId"
                  value={selectedSchool}
                  onValueChange={(schoolId) => {
                    setSelectedSchool(schoolId);
                    setSelectedDepartment("none");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a school" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              )}

              {selectedRole === "HOD" && selectedSchool !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="departmentId">Department</Label>
                  <Select
                    name="departmentId"
                    value={selectedDepartment}
                    onValueChange={setSelectedDepartment}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {filteredDepartments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {state && "error" in state && state.error && (
                <div className="text-sm font-medium text-destructive">
                  {state.error}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
