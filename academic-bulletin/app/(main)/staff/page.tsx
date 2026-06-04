"use client";

import { useState, useEffect, useMemo } from "react";
import { usePermission, useUser } from "@/contexts/user-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  formatStaffName,
  getAcademicRankDisplay,
} from "@/lib/validation/name-format";

type Department = {
  id: string;
  name: string;
  code: string;
};

type Staff = {
  id: string;
  title: string;
  gender: string;
  surname: string;
  middleName: string | null;
  firstName: string;
  highestQualification: string;
  academicRank: string;
  customJobTitle: string | null;
  specialization: string | null;
  email: string | null;
  imageUrl: string | null;
  type: string;
  isActive: boolean;
  departmentId: string;
  department: Department;
};

export default function StaffPage() {
  const router = useRouter();
  const { hasPermission } = usePermission();
  const { currentUser, isLoading: userLoading } = useUser();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");

  // Form State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    surname: "",
    firstName: "",
    middleName: "",
    gender: "",
    department: "",
    type: "ACADEMIC",
    academicRank: "",
    customJobTitle: "",
    highestQualification: "",
    specialization: "",
    email: "",
    isActive: true,
  });
  const [error, setError] = useState("");

  const canManage = hasPermission("manage:staff");
  const canView = hasPermission("view:staff");

  const fetchData = async () => {
    try {
      setIsLoading(true);

      // Fetch departments for filter
      const deptRes = await fetch("/api/departments");
      if (deptRes.ok) {
        const deptData = await deptRes.json();
        setDepartments(deptData);
      }

      // Fetch staff
      const response = await fetch("/api/staff");
      if (response.ok) {
        const data = await response.json();
        setStaff(data);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!userLoading && !canView && !canManage) {
      router.push("/dashboard");
    } else if (!userLoading) {
      fetchData();
    }
  }, [userLoading, canView, canManage, router]);

  const filteredStaff = staff.filter((s) => {
    // Role scoping
    if (
      currentUser?.role === "HOD" &&
      currentUser.departmentId &&
      s.departmentId !== currentUser.departmentId
    )
      return false;
    // Dept filter
    if (deptFilter !== "ALL" && s.departmentId !== deptFilter) return false;
    // Type filter
    if (typeFilter !== "ALL" && s.type !== typeFilter) return false;

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const fullName = `${s.title} ${s.firstName} ${s.surname}`.toLowerCase();
    return (
      fullName.includes(term) ||
      s.email?.toLowerCase().includes(term) ||
      s.specialization?.toLowerCase().includes(term)
    );
  });

  const openForm = (s?: Staff) => {
    setError("");
    if (s) {
      setEditingStaff(s);
      setFormData({
        title: s.title,
        surname: s.surname,
        firstName: s.firstName,
        middleName: s.middleName || "",
        gender: s.gender,
        department: s.departmentId,
        type: s.type,
        academicRank: s.academicRank,
        customJobTitle: s.customJobTitle || "",
        highestQualification: s.highestQualification,
        specialization: s.specialization || "",
        email: s.email || "",
        isActive: s.isActive,
      });
    } else {
      setEditingStaff(null);
      setFormData({
        title: "",
        surname: "",
        firstName: "",
        middleName: "",
        gender: "",
        department:
          currentUser?.departmentId ||
          (departments.length > 0 ? departments[0].id : ""),
        type: "ACADEMIC",
        academicRank: "",
        customJobTitle: "",
        highestQualification: "",
        specialization: "",
        email: "",
        isActive: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const url = editingStaff ? `/api/staff/${editingStaff.id}` : "/api/staff";
      const method = editingStaff ? "PUT" : "POST";

      const payload: any = { ...formData };
      payload.departmentId = formData.department;
      delete payload.department;

      if (payload.type !== "NON_ACADEMIC" && payload.academicRank === "OTHER") {
        payload.customJobTitle = "";
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(
          `Staff member ${editingStaff ? "updated" : "created"} successfully`,
        );
        setIsDialogOpen(false);
        fetchData();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save staff member");
      }
    } catch (err) {
      console.error(err);
      setError("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to delete ${name}? This action cannot be undone.`,
      )
    )
      return;

    try {
      const url = `/api/staff/${id}`;
      const response = await fetch(url, { method: "DELETE" });

      if (response.ok) {
        toast.success("Staff member deleted successfully");
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.error || "Failed to delete staff member");
      }
    } catch (err) {
      console.error(err);
      toast.error("An unexpected error occurred");
    }
  };

  const tableContent = useMemo(
    () => (
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Member</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Rank / Role</TableHead>
                <TableHead>Type</TableHead>
                {canManage && (
                  <TableHead className="text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStaff.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 5 : 4}
                    className="text-center h-24 text-muted-foreground"
                  >
                    No staff members found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredStaff.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={s.imageUrl || ""} alt={s.surname} />
                          <AvatarFallback>
                            {s.firstName[0]}
                            {s.surname[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {formatStaffName(s as any)}
                          </div>
                          {s.email && (
                            <div className="text-xs text-muted-foreground">
                              {s.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{s.department?.name || "Unknown"}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">
                        {getAcademicRankDisplay(s.academicRank as any)}
                        {s.academicRank === "OTHER" && s.customJobTitle
                          ? ` (${s.customJobTitle})`
                          : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.highestQualification}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.type === "ACADEMIC"
                            ? "default"
                            : s.type === "ADJUNCT"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {s.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openForm(s)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() =>
                              handleDelete(s.id, formatStaffName(s as any))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredStaff, canManage],
  );

  if (userLoading || (isLoading && staff.length === 0)) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading staff directory...
      </div>
    );
  }

  if (!canView && !canManage) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Directory</h1>
          <p className="text-muted-foreground">
            Manage academic and non-academic staff across departments
          </p>
        </div>
        {canManage && (
          <Button onClick={() => openForm()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Staff
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff by name, email, or specialization..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="ACADEMIC">Academic</SelectItem>
              <SelectItem value="ADJUNCT">Adjunct</SelectItem>
              <SelectItem value="NON_ACADEMIC">Non-Academic</SelectItem>
            </SelectContent>
          </Select>

          {currentUser?.role !== "HOD" && (
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="w-50 truncate">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {tableContent}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? "Edit Staff Member" : "Add Staff Member"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-6" onSubmit={handleSave}>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Select
                  value={formData.title}
                  onValueChange={(v) => setFormData({ ...formData, title: v })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Title" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MR">Mr.</SelectItem>
                    <SelectItem value="MRS">Mrs.</SelectItem>
                    <SelectItem value="MS">Ms.</SelectItem>
                    <SelectItem value="DR">Dr.</SelectItem>
                    <SelectItem value="PROF">Prof.</SelectItem>
                    <SelectItem value="ENGR">Engr.</SelectItem>
                    <SelectItem value="BARR">Barr.</SelectItem>
                    <SelectItem value="REV">Rev.</SelectItem>
                    <SelectItem value="PASTOR">Pastor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Gender *</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(v) => setFormData({ ...formData, gender: v })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Surname *</Label>
                <Input
                  required
                  value={formData.surname}
                  onChange={(e) =>
                    setFormData({ ...formData, surname: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>First Name *</Label>
                <Input
                  required
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Middle Name</Label>
                <Input
                  value={formData.middleName}
                  onChange={(e) =>
                    setFormData({ ...formData, middleName: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div className="space-y-2">
                <Label>Department *</Label>
                <Select
                  value={formData.department}
                  onValueChange={(v) =>
                    setFormData({ ...formData, department: v })
                  }
                  required
                  disabled={currentUser?.role === "HOD"}
                >
                  <SelectTrigger className="truncate">
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Staff Type *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACADEMIC">Academic</SelectItem>
                    <SelectItem value="ADJUNCT">Adjunct</SelectItem>
                    <SelectItem value="NON_ACADEMIC">Non-Academic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Highest Qualification *</Label>
                <Select
                  value={formData.highestQualification}
                  onValueChange={(v) =>
                    setFormData({ ...formData, highestQualification: v })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Qualification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHD">Ph.D</SelectItem>
                    <SelectItem value="MASTERS">Master&apos;s Degree</SelectItem>
                    <SelectItem value="BACHELOR">Bachelor&apos;s Degree</SelectItem>
                    <SelectItem value="HND">HND</SelectItem>
                    <SelectItem value="OND">OND</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic Rank / Role *</Label>
                <Select
                  value={formData.academicRank}
                  onValueChange={(v) =>
                    setFormData({ ...formData, academicRank: v })
                  }
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Rank" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROFESSOR">Professor</SelectItem>
                    <SelectItem value="ASSOCIATE_PROFESSOR">
                      Associate Professor
                    </SelectItem>
                    <SelectItem value="SENIOR_LECTURER">
                      Senior Lecturer
                    </SelectItem>
                    <SelectItem value="LECTURER_I">Lecturer I</SelectItem>
                    <SelectItem value="LECTURER_II">Lecturer II</SelectItem>
                    <SelectItem value="ASSISTANT_LECTURER">
                      Assistant Lecturer
                    </SelectItem>
                    <SelectItem value="GRADUATE_ASSISTANT">
                      Graduate Assistant
                    </SelectItem>
                    <SelectItem value="OTHER">Other / Non-Academic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.academicRank === "OTHER" && (
                <div className="space-y-2 col-span-2">
                  <Label>Custom Job Title *</Label>
                  <Input
                    required
                    value={formData.customJobTitle}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        customJobTitle: e.target.value,
                      })
                    }
                    placeholder="e.g. Lab Technologist, Secretary"
                  />
                </div>
              )}

              <div className="space-y-2 col-span-2">
                <Label>Specialization</Label>
                <Input
                  value={formData.specialization}
                  onChange={(e) =>
                    setFormData({ ...formData, specialization: e.target.value })
                  }
                  placeholder="e.g. Artificial Intelligence, Data Science"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm font-medium text-destructive">
                {error}
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : editingStaff
                    ? "Save Changes"
                    : "Add Staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
