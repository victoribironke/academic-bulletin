"use client";

import { useState, useEffect, useCallback } from "react";
import { usePermission, useUser } from "@/contexts/user-context";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, GraduationCap, FileText } from "lucide-react";
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
  school: School;
}

interface Programme {
  id: string;
  name: string;
  code: string;
  description: string | null;
  degreeType: string | null;
  duration: number | null;
  departmentId: string;
  department: Department;
  _count: {
    submissions: number;
  };
}

export default function ProgrammesPage() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProgramme, setEditingProgramme] = useState<Programme | null>(
    null,
  );
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    degreeType: "",
    duration: "",
    departmentId: "",
  });
  const [filterSchoolId, setFilterSchoolId] = useState<string>("all");
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>("all");
  const [error, setError] = useState("");
  const { hasPermission } = usePermission();
  const { currentUser } = useUser();

  const canManage = hasPermission("manage:programmes");
  const isHOD = currentUser?.role === "HOD";
  const isDean = currentUser?.role === "DEAN";
  const canCreate = canManage && !isHOD && !isDean;
  const canDelete = canManage && !isHOD && !isDean;
  const canEdit = canManage || isHOD || isDean;
  const hodDepartmentId = currentUser?.departmentId;

  const fetchProgrammes = useCallback(async () => {
    try {
      let url = "/api/programmes";
      const params = new URLSearchParams();

      const effectiveDepartmentId = isHOD && hodDepartmentId ? hodDepartmentId : filterDepartmentId;

      if (effectiveDepartmentId !== "all") {
        params.set("departmentId", effectiveDepartmentId);
      } else if (filterSchoolId !== "all") {
        params.set("schoolId", filterSchoolId);
      }
      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setProgrammes(data);
      }
    } catch (err) {
      console.error("Failed to fetch programmes:", err);
    } finally {
      setIsLoading(false);
    }
  }, [filterDepartmentId, filterSchoolId, isHOD, hodDepartmentId]);

  const fetchDepartments = async () => {
    try {
      const response = await fetch("/api/departments");
      if (response.ok) {
        const data = await response.json();
        setDepartments(data);
      }
    } catch (err) {
      console.error("Failed to fetch departments:", err);
    }
  };

  const fetchSchools = async () => {
    try {
      const response = await fetch("/api/schools");
      if (response.ok) {
        const data = await response.json();
        setSchools(data);
      }
    } catch (err) {
      console.error("Failed to fetch schools:", err);
    }
  };

  useEffect(() => {
    fetchSchools();
    fetchDepartments();
  }, []);

  useEffect(() => {
    fetchProgrammes();
  }, [fetchProgrammes]);

  // Reset department filter when school changes
  useEffect(() => {
    setFilterDepartmentId("all");
  }, [filterSchoolId]);

  const filteredDepartments =
    filterSchoolId !== "all"
      ? departments.filter((d) => d.school.id === filterSchoolId)
      : departments;

  const displayDepartments = isHOD && hodDepartmentId
    ? departments.filter((d) => d.id === hodDepartmentId)
    : filteredDepartments;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.departmentId) {
      setError("Please select a department");
      return;
    }

    try {
      const url = editingProgramme
        ? `/api/programmes/${editingProgramme.id}`
        : "/api/programmes";
      const method = editingProgramme ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          duration: formData.duration ? parseInt(formData.duration) : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to save programme");
        return;
      }

      setIsDialogOpen(false);
      setEditingProgramme(null);
      setFormData({
        name: "",
        code: "",
        description: "",
        degreeType: "",
        duration: "",
        departmentId: "",
      });
      fetchProgrammes();
      toast.success(editingProgramme ? "Programme updated successfully" : "Programme created successfully");
    } catch (err) {
      console.error("Failed to save programme:", err);
      setError("Failed to save programme");
    }
  };

  const handleEdit = (programme: Programme) => {
    setEditingProgramme(programme);
    setFormData({
      name: programme.name,
      code: programme.code,
      description: programme.description || "",
      degreeType: programme.degreeType || "",
      duration: programme.duration?.toString() || "",
      departmentId: programme.departmentId,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (programme: Programme) => {
    if (
      !confirm(
        `Are you sure you want to delete "${programme.name}"? This will also delete all associated submissions.`,
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/programmes/${programme.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to delete programme");
        return;
      }

      fetchProgrammes();
    } catch (err) {
      console.error("Failed to delete programme:", err);
      alert("Failed to delete programme");
    }
  };

  const openCreateDialog = () => {
    setEditingProgramme(null);
    setFormData({
      name: "",
      code: "",
      description: "",
      degreeType: "",
      duration: "",
      departmentId: isHOD && hodDepartmentId
        ? hodDepartmentId
        : filterDepartmentId !== "all"
        ? filterDepartmentId
        : "",
    });
    setError("");
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading programmes...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Programmes</h1>
          <p className="text-muted-foreground">Manage academic programmes</p>
        </div>
        {canCreate && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Programme
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingProgramme ? "Edit Programme" : "Add New Programme"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingProgramme
                      ? "Update the programme information below."
                      : "Enter the details for the new programme."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {error && (
                    <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                      {error}
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="department">Department</Label>
                    <Select
                      value={formData.departmentId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, departmentId: value })
                      }
                      disabled={isHOD}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a department" />
                      </SelectTrigger>
                      <SelectContent>
                        {displayDepartments.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name} ({dept.school.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="name">Programme Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="B.Sc. Software Engineering"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="code">Code</Label>
                      <Input
                        id="code"
                        value={formData.code}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            code: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="BSC-SE"
                        required
                        maxLength={15}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="degreeType">Degree Type</Label>
                      <Select
                        value={formData.degreeType}
                        onValueChange={(value) =>
                          setFormData({ ...formData, degreeType: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BSc">B.Sc.</SelectItem>
                          <SelectItem value="BA">B.A.</SelectItem>
                          <SelectItem value="BEng">B.Eng.</SelectItem>
                          <SelectItem value="MSc">M.Sc.</SelectItem>
                          <SelectItem value="MA">M.A.</SelectItem>
                          <SelectItem value="PhD">Ph.D.</SelectItem>
                          <SelectItem value="PGD">PGD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="duration">Duration (years)</Label>
                    <Input
                      id="duration"
                      type="number"
                      min="1"
                      max="10"
                      value={formData.duration}
                      onChange={(e) =>
                        setFormData({ ...formData, duration: e.target.value })
                      }
                      placeholder="4"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      placeholder="Brief description of the programme..."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingProgramme ? "Save Changes" : "Create Programme"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="filter-school" className="whitespace-nowrap">
                School:
              </Label>
              <Select value={filterSchoolId} onValueChange={setFilterSchoolId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Schools" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Schools</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="filter-dept" className="whitespace-nowrap">
                Department:
              </Label>
              <Select
                value={isHOD && hodDepartmentId ? hodDepartmentId : filterDepartmentId}
                onValueChange={setFilterDepartmentId}
                disabled={isHOD}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  {!isHOD && <SelectItem value="all">All Departments</SelectItem>}
                  {displayDepartments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Programmes Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Programmes
          </CardTitle>
          <CardDescription>
            {programmes.length} programme{programmes.length !== 1 ? "s" : ""}{" "}
            found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {programmes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No programmes found.{" "}
              {canCreate && "Click 'Add Programme' to create one."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Degree</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Submissions</TableHead>
                  {(canEdit || canDelete) && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {programmes.map((prog) => (
                  <TableRow key={prog.id}>
                    <TableCell className="font-medium">{prog.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{prog.code}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{prog.department.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {prog.department.school.code}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{prog.degreeType || "—"}</TableCell>
                    <TableCell>
                      {prog.duration ? `${prog.duration} yrs` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {prog._count.submissions}
                      </div>
                    </TableCell>
                    {(canEdit || canDelete) && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(prog)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(prog)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
