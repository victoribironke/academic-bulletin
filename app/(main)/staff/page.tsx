"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { TableCard, TableToolbar } from "@/components/shared/table-toolbar";
import { EmptyState, TableSkeleton } from "@/components/shared/states";
import { usePermission, useUser } from "@/contexts/user-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { Plus, Pencil, Trash2, RefreshCw, Upload, UserCog } from "lucide-react";
import { toast } from "sonner";
import { BulkImportDialog } from "@/components/imports/bulk-import-dialog";
import {
  STAFF_TEMPLATE_COLUMNS,
  STAFF_TEMPLATE_EXAMPLES,
  staffDuplicateKey,
  validateStaffImportRows,
  type StaffImportData,
} from "@/lib/imports/staff";
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

const STAFF_TYPE_LABELS: Record<string, string> = {
  ACADEMIC: "Academic",
  ADJUNCT: "Adjunct",
  NON_ACADEMIC: "Non-academic",
};

export default function StaffPage() {
  const router = useRouter();
  const { hasPermission } = usePermission();
  const { currentUser, isLoading: userLoading } = useUser();

  const [staff, setStaff] = useState<Staff[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

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

  const fetchData = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!userLoading && !canView && !canManage) router.push("/dashboard");
  }, [userLoading, canView, canManage, router]);

  useEffect(() => {
    if (userLoading || (!canView && !canManage)) return;
    let cancelled = false;
    Promise.all([fetch("/api/departments"), fetch("/api/staff")])
      .then(async ([deptRes, staffRes]) => {
        const deptData = deptRes.ok ? await deptRes.json() : null;
        const staffData = await staffRes.json().catch(() => ({}));
        if (cancelled) return;
        if (deptData) setDepartments(deptData);
        if (staffRes.ok) setStaff(staffData);
        else toast.error(staffData.error || "Failed to load the staff directory");
      })
      .catch((err) => console.error("Failed to fetch data:", err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userLoading, canView, canManage, reloadKey]);

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
      const method = editingStaff ? "PATCH" : "POST";

      const payload: any = { ...formData };
      payload.departmentId = formData.department;
      delete payload.department;

      if (payload.academicRank !== "OTHER") {
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

  const filtersActive =
    searchTerm.trim() !== "" || typeFilter !== "ALL" || deptFilter !== "ALL";

  const tableContent =
    filteredStaff.length === 0 ? (
      <EmptyState
        icon={UserCog}
        title={filtersActive ? "No staff match these filters" : "No staff yet"}
        description={
          filtersActive
            ? "Try a different search or clear the filters."
            : canManage
              ? "Add staff one at a time or upload a spreadsheet."
              : undefined
        }
      />
    ) : (
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead>Staff member</TableHead>
              <TableHead className="hidden md:table-cell">Department</TableHead>
              <TableHead>Rank / role</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              {canManage && (
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStaff.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarImage src={s.imageUrl || ""} alt="" />
                      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                        {s.firstName[0]}
                        {s.surname[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{formatStaffName(s as any)}</p>
                      {s.email && (
                        <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {s.department?.name || "Unknown"}
                </TableCell>
                <TableCell>
                  <p className="text-sm font-medium">
                    {getAcademicRankDisplay(s.academicRank as any)}
                    {s.academicRank === "OTHER" && s.customJobTitle
                      ? ` (${s.customJobTitle})`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.highestQualification}</p>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge
                    variant={
                      s.type === "ACADEMIC"
                        ? "default"
                        : s.type === "ADJUNCT"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {STAFF_TYPE_LABELS[s.type] ?? s.type}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openForm(s)}
                        aria-label={`Edit ${formatStaffName(s as any)}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(s.id, formatStaffName(s as any))}
                        aria-label={`Delete ${formatStaffName(s as any)}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    );

  if (userLoading || (isLoading && staff.length === 0)) {
    return <TableSkeleton columns={4} />;
  }

  if (!canView && !canManage) return null;

  const importDepartmentId =
    currentUser?.role === "HOD"
      ? currentUser.departmentId || ""
      : deptFilter !== "ALL"
        ? deptFilter
        : "";

  const openBulkImport = () => {
    if (!importDepartmentId) {
      toast.error("Select a department before starting a bulk staff upload.");
      return;
    }
    setBulkImportOpen(true);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Staff Directory"
        description={
          currentUser?.role === "HOD"
            ? "Staff in your department. Everyone added here can be selected in your bulletin."
            : "Academic and non-academic staff across departments."
        }
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={openBulkImport}>
                <Upload />
                Bulk upload
              </Button>
              <Button onClick={() => openForm()}>
                <Plus />
                Add staff
              </Button>
            </>
          )
        }
      />

      <TableToolbar
        search={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search name, email or specialisation"
        filters={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full bg-card sm:w-40" aria-label="Staff type">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                <SelectItem value="ACADEMIC">Academic</SelectItem>
                <SelectItem value="ADJUNCT">Adjunct</SelectItem>
                <SelectItem value="NON_ACADEMIC">Non-academic</SelectItem>
              </SelectContent>
            </Select>
            {currentUser?.role !== "HOD" && (
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-full bg-card sm:w-56 [&>span]:truncate" aria-label="Department">
                  <SelectValue placeholder="All departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All departments</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        }
        actions={
          <>
            <span className="text-sm text-muted-foreground">
              {filteredStaff.length} staff
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchData}
              disabled={isLoading}
              aria-label="Refresh"
            >
              <RefreshCw className={isLoading ? "animate-spin" : ""} />
            </Button>
          </>
        }
      />

      {tableContent}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingStaff ? "Edit Staff Member" : "Add Staff Member"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-6" onSubmit={handleSave}>
            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
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
                <div className="space-y-2 sm:col-span-2">
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

              <div className="space-y-2 sm:col-span-2">
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

      <BulkImportDialog<StaffImportData>
        open={bulkImportOpen}
        onOpenChange={setBulkImportOpen}
        title="Bulk Upload Staff"
        description="Upload an Excel or CSV file. All rows are checked before anything is saved, and every imported staff member is assigned to the selected department. Photos remain individually managed."
        templateFilename="staff-bulk-upload-template.csv"
        templateColumns={STAFF_TEMPLATE_COLUMNS}
        templateRows={STAFF_TEMPLATE_EXAMPLES}
        previewColumns={[
          { label: "Name", value: (row) => `${row.surname}, ${row.firstName}` },
          { label: "Type", value: (row) => row.type },
          { label: "Rank / Role", value: (row) => row.customJobTitle || row.academicRank },
          { label: "Email", value: (row) => row.email || "-" },
        ]}
        validateRows={(rows) =>
          validateStaffImportRows(
            rows,
            staff
              .filter((member) => member.departmentId === importDepartmentId)
              .map(staffDuplicateKey),
          )
        }
        onImport={async (rows) => {
          const response = await fetch("/api/staff/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ departmentId: importDepartmentId, rows }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "Failed to import staff members.");
          toast.success(`${data.imported} staff member(s) imported successfully.`);
          await fetchData();
        }}
      />
    </div>
  );
}
