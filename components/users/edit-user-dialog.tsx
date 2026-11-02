"use client";

import { useState } from "react";
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
import { Edit2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export function EditUserDialog({
  user,
  schools,
  departments,
  programmes,
  canChangeRole = false,
  allowSuperAdmin = false,
  onSuccess,
}: {
  user: any;
  schools: any[];
  departments: any[];
  programmes: any[];
  canChangeRole?: boolean;
  allowSuperAdmin?: boolean;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState<string>(user.firstName ?? "");
  const [lastName, setLastName] = useState<string>(user.lastName ?? "");
  const [selectedRole, setSelectedRole] = useState<string>(user.role);
  const [isPending, setIsPending] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<string>(
    user.schoolId || "none",
  );
  const [selectedDepartment, setSelectedDepartment] = useState<string>(
    user.departmentId || "none",
  );
  const [selectedProgrammes, setSelectedProgrammes] = useState<string[]>(
    user.programmeIds || [],
  );
  const [error, setError] = useState("");

  const filteredDepartments =
    selectedSchool !== "none"
      ? departments.filter((d) => d.schoolId === selectedSchool)
      : [];

  // Reset the form to the user's current details each time it opens.
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setSelectedRole(user.role);
      setSelectedSchool(user.schoolId || "none");
      setSelectedDepartment(user.departmentId || "none");
      setSelectedProgrammes(user.programmeIds || []);
      setError("");
    }
    setOpen(isOpen);
  };

  const filteredProgrammes = programmes.filter(
    (programme) => programme.departmentId === selectedDepartment,
  );

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    setIsPending(true);
    setError("");
    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(firstName.trim() !== user.firstName && { firstName: firstName.trim() }),
          ...(lastName.trim() !== user.lastName && { lastName: lastName.trim() }),
          ...(selectedRole !== user.role && { role: selectedRole }),
          schoolId: selectedSchool === "none" ? null : selectedSchool,
          departmentId:
            selectedDepartment === "none" ? null : selectedDepartment,
          ...(selectedRole === "PROGRAMME_COORDINATOR" && {
            programmeIds: selectedProgrammes,
          }),
        }),
      });

      if (response.ok) {
        setOpen(false);
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to update user");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Edit ${user.firstName} ${user.lastName}`}>
          <Edit2 />
          <span className="hidden sm:inline">Edit</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update {user.firstName} {user.lastName}&apos;s role and assigned unit.
            Their sign-in email ({user.email}) can&apos;t be changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`firstName-${user.id}`}>First name</Label>
              <Input
                id={`firstName-${user.id}`}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`lastName-${user.id}`}>Last name</Label>
              <Input
                id={`lastName-${user.id}`}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={80}
                required
              />
            </div>
          </div>

          {canChangeRole && (
            <div className="space-y-2">
              <Label htmlFor={`role-${user.id}`}>Role</Label>
              <Select
                value={selectedRole}
                onValueChange={(role) => {
                  setSelectedRole(role);
                  if (role !== "PROGRAMME_COORDINATOR") {
                    setSelectedProgrammes([]);
                  }
                }}
              >
                <SelectTrigger id={`role-${user.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROGRAMME_COORDINATOR">
                    Programme Coordinator
                  </SelectItem>
                  <SelectItem value="HOD">Head of Department</SelectItem>
                  <SelectItem value="DEAN">Dean</SelectItem>
                  <SelectItem value="ADMIN">Academic Planning</SelectItem>
                  {allowSuperAdmin && (
                    <SelectItem value="SUPER_ADMIN">Super Administrator</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="schoolId">School (Optional)</Label>
            <Select
              value={selectedSchool}
              onValueChange={(val) => {
                setSelectedSchool(val);
                setSelectedDepartment("none");
                setSelectedProgrammes([]);
              }}
            >
              <SelectTrigger id="schoolId" className="w-full">
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
              <Select
                value={selectedDepartment}
                onValueChange={(departmentId) => {
                  setSelectedDepartment(departmentId);
                  setSelectedProgrammes([]);
                }}
              >
                <SelectTrigger id="departmentId" className="w-full">
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

          {selectedRole === "PROGRAMME_COORDINATOR" &&
            selectedDepartment !== "none" && (
              <div className="space-y-2">
                <Label>Assigned programmes</Label>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">
                  {filteredProgrammes.map((programme) => {
                    const checked = selectedProgrammes.includes(programme.id);
                    return (
                      <label
                        key={programme.id}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            setSelectedProgrammes((current) =>
                              value
                                ? [...current, programme.id]
                                : current.filter((id) => id !== programme.id),
                            )
                          }
                        />
                        <span>
                          {programme.name} ({programme.code})
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

          {error && (
            <div className="text-sm font-medium text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
