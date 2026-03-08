"use client";

import { useActionState, useState } from "react";
import { adminCreateUser } from "@/app/actions/admin";
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
import { Plus } from "lucide-react";

export function CreateUserDialog({
  schools,
  departments,
}: {
  schools: { id: string; name: string }[];
  departments: { id: string; name: string; schoolId: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<string>("none");
  const [state, formAction, isPending] = useActionState(adminCreateUser, null);

  // Close dialog on success
  if (state?.success && open) {
    setOpen(false);
  }

  const filteredDepartments =
    selectedSchool !== "none"
      ? departments.filter((d) => d.schoolId === selectedSchool)
      : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New User</DialogTitle>
          <DialogDescription>
            Add a new user to the system. An email will not be sent, so provide
            the credentials directly to the user.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4 py-4">
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
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">System Role</Label>
            <Select name="role" defaultValue="HOD" required>
              <SelectTrigger>
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HOD">Head of Department (HOD)</SelectItem>
                <SelectItem value="DEAN">Dean</SelectItem>
                <SelectItem value="ADMIN">Academic Planning Admin</SelectItem>
                <SelectItem value="SUPER_ADMIN">Super Administrator</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schoolId">School (Optional)</Label>
            <Select
              name="schoolId"
              value={selectedSchool}
              onValueChange={setSelectedSchool}
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

          {selectedSchool !== "none" && (
            <div className="space-y-2">
              <Label htmlFor="departmentId">Department (Optional)</Label>
              <Select name="departmentId" defaultValue="none">
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

          {state?.error && (
            <div className="text-sm font-medium text-destructive">
              {state.error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
