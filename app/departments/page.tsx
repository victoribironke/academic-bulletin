"use client";

import { useState, useEffect } from "react";
import { usePermission } from "@/contexts/user-context";
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
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  GraduationCap,
  Users,
} from "lucide-react";

interface School {
  id: string;
  name: string;
  code: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  schoolId: string;
  school: School;
  _count: {
    programmes: number;
    users: number;
  };
}

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(
    null
  );
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    schoolId: "",
  });
  const [filterSchoolId, setFilterSchoolId] = useState<string>("all");
  const [error, setError] = useState("");
  const { hasPermission } = usePermission();

  const canManage = hasPermission("manage:departments");

  const fetchDepartments = async () => {
    try {
      const url =
        filterSchoolId && filterSchoolId !== "all"
          ? `/api/departments?schoolId=${filterSchoolId}`
          : "/api/departments";
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setDepartments(data);
      }
    } catch (err) {
      console.error("Failed to fetch departments:", err);
    } finally {
      setIsLoading(false);
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
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [filterSchoolId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.schoolId) {
      setError("Please select a school");
      return;
    }

    try {
      const url = editingDepartment
        ? `/api/departments/${editingDepartment.id}`
        : "/api/departments";
      const method = editingDepartment ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to save department");
        return;
      }

      setIsDialogOpen(false);
      setEditingDepartment(null);
      setFormData({ name: "", code: "", description: "", schoolId: "" });
      fetchDepartments();
    } catch (err) {
      console.error("Failed to save department:", err);
      setError("Failed to save department");
    }
  };

  const handleEdit = (department: Department) => {
    setEditingDepartment(department);
    setFormData({
      name: department.name,
      code: department.code,
      description: department.description || "",
      schoolId: department.schoolId,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (department: Department) => {
    if (
      !confirm(
        `Are you sure you want to delete "${department.name}"? This will also delete all associated programmes.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/departments/${department.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to delete department");
        return;
      }

      fetchDepartments();
    } catch (err) {
      console.error("Failed to delete department:", err);
      alert("Failed to delete department");
    }
  };

  const openCreateDialog = () => {
    setEditingDepartment(null);
    setFormData({
      name: "",
      code: "",
      description: "",
      schoolId: filterSchoolId !== "all" ? filterSchoolId : "",
    });
    setError("");
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading departments...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
          <p className="text-muted-foreground">
            Manage departments within schools
          </p>
        </div>
        {canManage && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Add Department
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingDepartment
                      ? "Edit Department"
                      : "Add New Department"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingDepartment
                      ? "Update the department information below."
                      : "Enter the details for the new department."}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {error && (
                    <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                      {error}
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="school">School</Label>
                    <Select
                      value={formData.schoolId}
                      onValueChange={(value) =>
                        setFormData({ ...formData, schoolId: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a school" />
                      </SelectTrigger>
                      <SelectContent>
                        {schools.map((school) => (
                          <SelectItem key={school.id} value={school.id}>
                            {school.name} ({school.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="Computer Science"
                      required
                    />
                  </div>
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
                      placeholder="CS"
                      required
                      maxLength={10}
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
                      placeholder="Brief description of the department..."
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
                    {editingDepartment ? "Save Changes" : "Create Department"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="filter-school" className="whitespace-nowrap">
              Filter by School:
            </Label>
            <Select value={filterSchoolId} onValueChange={setFilterSchoolId}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="All Schools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Schools</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name} ({school.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Departments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {filterSchoolId !== "all"
              ? `Departments in ${
                  schools.find((s) => s.id === filterSchoolId)?.name ||
                  "Selected School"
                }`
              : "All Departments"}
          </CardTitle>
          <CardDescription>
            {departments.length} department{departments.length !== 1 ? "s" : ""}{" "}
            found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {departments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No departments found.{" "}
              {canManage && "Click 'Add Department' to create one."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>School</TableHead>
                  <TableHead>Programmes</TableHead>
                  <TableHead>Users</TableHead>
                  {canManage && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((dept) => (
                  <TableRow key={dept.id}>
                    <TableCell className="font-medium">{dept.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{dept.code}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{dept.school.code}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <GraduationCap className="h-4 w-4 text-muted-foreground" />
                        {dept._count.programmes}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {dept._count.users}
                      </div>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(dept)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(dept)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
