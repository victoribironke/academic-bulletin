"use client";

import { useActionState, useState } from "react";
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
import { Plus, CircleCheck } from "lucide-react";

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
  const [addedEmail, setAddedEmail] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [state, formAction, isPending] = useActionState(
    async (prev: unknown, formData: FormData) => {
      const result = await adminCreateUser(prev, formData);
      if ("success" in result && result.success) {
        setAddedEmail(result.email);
        setEmailSent(result.emailSent);
        toast.success("User added", {
          description: `${result.email} can now sign in with Google.`,
        });
        onSuccess?.();
      } else if ("error" in result && result.error) {
        toast.error("Failed to create user", { description: result.error });
      }
      return result;
    },
    null,
  );

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setAddedEmail(null);
      setEmailSent(false);
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
        {addedEmail ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CircleCheck className="h-5 w-5 text-green-500" />
                User Added
              </DialogTitle>
              <DialogDescription>
                {emailSent
                  ? `${addedEmail} has been emailed a link to the sign-in page. They sign in with the Google account that uses this address.`
                  : `${addedEmail} can now sign in with the Google account that uses this address. The notification email could not be sent, so let them know directly.`}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add the email address this person will sign in with. It can be
                a school or personal Google account.
              </DialogDescription>
            </DialogHeader>

            <form action={formAction} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
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
