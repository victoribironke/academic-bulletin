"use client";

import { useState, useEffect } from "react";
import { usePermission } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Pencil,
  Trash2,
  School as SchoolIcon,
  Building2,
  GraduationCap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

// Types
type Programme = {
  id: string;
  name: string;
  code: string;
  duration: number | null;
  description: string | null;
  departmentId: string;
};
type Department = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  schoolId: string;
  programmes: Programme[];
};
type School = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  departments: Department[];
};

export default function AcademicUnitsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { hasPermission } = usePermission();

  // Collapsible state
  const [expandedSchools, setExpandedSchools] = useState<Set<string>>(
    new Set(),
  );
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(
    new Set(),
  );

  // Form State
  const [isSchoolDialogOpen, setIsSchoolDialogOpen] = useState(false);
  const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false);
  const [isProgDialogOpen, setIsProgDialogOpen] = useState(false);

  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [editingProg, setEditingProg] = useState<Programme | null>(null);

  const [parentSchoolId, setParentSchoolId] = useState<string | null>(null);
  const [parentDeptId, setParentDeptId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    duration: "4",
  });
  const [error, setError] = useState("");

  const canManage = hasPermission("manage:schools");

  const fetchData = async () => {
    try {
      const response = await fetch("/api/academic-units");
      if (response.ok) {
        const data = await response.json();
        setSchools(data);
      }
    } catch (err) {
      console.error("Failed to fetch academic units:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleSchool = (id: string) => {
    const newSet = new Set(expandedSchools);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedSchools(newSet);
  };

  const toggleDept = (id: string) => {
    const newSet = new Set(expandedDepartments);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedDepartments(newSet);
  };

  const openSchoolForm = (school?: School) => {
    setError("");
    if (school) {
      setEditingSchool(school);
      setFormData({
        name: school.name,
        code: school.code,
        description: school.description || "",
        duration: "4",
      });
    } else {
      setEditingSchool(null);
      setFormData({ name: "", code: "", description: "", duration: "4" });
    }
    setIsSchoolDialogOpen(true);
  };

  const openDeptForm = (schoolId: string, dept?: Department) => {
    setError("");
    setParentSchoolId(schoolId);
    if (dept) {
      setEditingDept(dept);
      setFormData({
        name: dept.name,
        code: dept.code,
        description: dept.description || "",
        duration: "4",
      });
    } else {
      setEditingDept(null);
      setFormData({ name: "", code: "", description: "", duration: "4" });
    }
    setIsDeptDialogOpen(true);
  };

  const openProgForm = (deptId: string, prog?: Programme) => {
    setError("");
    setParentDeptId(deptId);
    if (prog) {
      setEditingProg(prog);
      setFormData({
        name: prog.name,
        code: prog.code,
        description: prog.description || "",
        duration: prog.duration?.toString() || "4",
      });
    } else {
      setEditingProg(null);
      setFormData({ name: "", code: "", description: "", duration: "4" });
    }
    setIsProgDialogOpen(true);
  };

  const handleSave = async (type: "school" | "department" | "programme") => {
    setError("");
    const sanitize = (str: string) => str.replace(/<[^>]*>?/gm, "");
    const baseData = {
      name: sanitize(formData.name),
      code: sanitize(formData.code),
      description: sanitize(formData.description),
    };

    try {
      let url = "";
      let method = "POST";
      const payload: any = { ...baseData };

      if (type === "school") {
        url = editingSchool
          ? `/api/schools/${editingSchool.id}`
          : "/api/schools";
        method = editingSchool ? "PUT" : "POST";
      } else if (type === "department") {
        url = editingDept
          ? `/api/departments/${editingDept.id}`
          : "/api/departments";
        method = editingDept ? "PUT" : "POST";
        payload.schoolId = parentSchoolId;
      } else if (type === "programme") {
        url = editingProg
          ? `/api/programmes/${editingProg.id}`
          : "/api/programmes";
        method = editingProg ? "PUT" : "POST";
        payload.departmentId = parentDeptId;
        payload.duration = parseInt(formData.duration) || 4;
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(
          `${type.charAt(0).toUpperCase() + type.slice(1)} saved successfully`,
        );
        setIsSchoolDialogOpen(false);
        setIsDeptDialogOpen(false);
        setIsProgDialogOpen(false);
        fetchData();
      } else {
        const data = await response.json();
        setError(data.error || `Failed to save ${type}`);
      }
    } catch (err) {
      console.error(err);
      setError(`An unexpected error occurred while saving ${type}`);
    }
  };

  const handleDelete = async (
    type: "school" | "department" | "programme",
    id: string,
    name: string,
  ) => {
    if (
      !confirm(
        `Are you sure you want to delete the ${type} "${name}"?\nThis action cannot be undone.`,
      )
    )
      return;

    try {
      const url = `/api/${type}s/${id}`;
      const response = await fetch(url, { method: "DELETE" });

      if (response.ok) {
        toast.success(
          `${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`,
        );
        fetchData();
      } else {
        const data = await response.json();
        toast.error(data.error || `Failed to delete ${type}`);
      }
    } catch (err) {
      console.error(err);
      toast.error(`An unexpected error occurred while deleting ${type}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading academic units...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Academic Units</h1>
          <p className="text-muted-foreground">
            Manage schools, departments, and programmes
          </p>
        </div>
        {canManage && (
          <Button onClick={() => openSchoolForm()}>
            <Plus className="mr-2 h-4 w-4" />
            New School
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {schools.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No academic units found. Create a school to get started.
            </CardContent>
          </Card>
        ) : (
          schools.map((school) => (
            <Card key={school.id} className="overflow-hidden">
              <div
                className="flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 cursor-pointer"
                onClick={() => toggleSchool(school.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 border rounded-md bg-background">
                    <SchoolIcon className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {school.name} ({school.code})
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {school.departments.length} Departments
                    </p>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canManage && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openSchoolForm(school)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() =>
                          handleDelete("school", school.id, school.name)
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleSchool(school.id)}
                  >
                    {expandedSchools.has(school.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {expandedSchools.has(school.id) && (
                <div className="p-4 pt-2 border-t space-y-3">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground ml-2">
                      Departments
                    </h4>
                    {canManage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDeptForm(school.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Department
                      </Button>
                    )}
                  </div>

                  {school.departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground ml-2">
                      No departments under this school.
                    </p>
                  ) : (
                    school.departments.map((dept) => (
                      <div
                        key={dept.id}
                        className="border rounded-md ml-4 bg-background"
                      >
                        <div
                          className="flex items-center justify-between p-3 hover:bg-muted/30 cursor-pointer"
                          onClick={() => toggleDept(dept.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 border rounded-md">
                              <Building2 className="h-4 w-4 text-green-500" />
                            </div>
                            <div>
                              <p className="font-medium">
                                {dept.name} ({dept.code})
                              </p>
                            </div>
                          </div>
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {canManage && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => openDeptForm(school.id, dept)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  onClick={() =>
                                    handleDelete(
                                      "department",
                                      dept.id,
                                      dept.name,
                                    )
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => toggleDept(dept.id)}
                            >
                              {expandedDepartments.has(dept.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {expandedDepartments.has(dept.id) && (
                          <div className="p-3 pt-0 border-t bg-muted/10">
                            <div className="flex justify-between items-center my-3 ml-2">
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Programmes
                              </h5>
                              {canManage && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => openProgForm(dept.id)}
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Add
                                  Programme
                                </Button>
                              )}
                            </div>

                            <div className="space-y-2 ml-4">
                              {dept.programmes.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  No programmes under this department.
                                </p>
                              ) : (
                                dept.programmes.map((prog) => (
                                  <div
                                    key={prog.id}
                                    className="flex items-center justify-between p-2 pb-1 border-b last:border-0 hover:bg-muted/30"
                                  >
                                    <div className="flex items-center gap-2">
                                      <GraduationCap className="h-4 w-4 text-purple-500" />
                                      <span className="text-sm">
                                        {prog.name} ({prog.code})
                                      </span>
                                      {prog.duration && (
                                        <span className="text-xs text-muted-foreground ml-2 border px-1.5 py-0.5 rounded">
                                          {prog.duration} Yrs
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className="flex gap-1"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {canManage && (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() =>
                                              openProgForm(dept.id, prog)
                                            }
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive"
                                            onClick={() =>
                                              handleDelete(
                                                "programme",
                                                prog.id,
                                                prog.name,
                                              )
                                            }
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Shared Form Handlers below */}
      {/* School Form */}
      <Dialog open={isSchoolDialogOpen} onOpenChange={setIsSchoolDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSchool ? "Edit School" : "Add School"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave("school");
            }}
          >
            <div className="space-y-2">
              <Label>School Name *</Label>
              <Input
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g. School of Science"
              />
            </div>
            <div className="space-y-2">
              <Label>School Code *</Label>
              <Input
                required
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase(),
                  })
                }
                placeholder="e.g. SOS"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description..."
              />
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
                onClick={() => setIsSchoolDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingSchool ? "Save Changes" : "Create School"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Department Form */}
      <Dialog open={isDeptDialogOpen} onOpenChange={setIsDeptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDept ? "Edit Department" : "Add Department"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave("department");
            }}
          >
            <div className="space-y-2">
              <Label>Department Name *</Label>
              <Input
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g. Department of Computer Science"
              />
            </div>
            <div className="space-y-2">
              <Label>Department Code *</Label>
              <Input
                required
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase(),
                  })
                }
                placeholder="e.g. CSC"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description..."
              />
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
                onClick={() => setIsDeptDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingDept ? "Save Changes" : "Create Department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Programme Form */}
      <Dialog open={isProgDialogOpen} onOpenChange={setIsProgDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProg ? "Edit Programme" : "Add Programme"}
            </DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave("programme");
            }}
          >
            <div className="space-y-2">
              <Label>Programme Name *</Label>
              <Input
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g. B.Sc. Computer Science"
              />
            </div>
            <div className="space-y-2">
              <Label>Programme Code *</Label>
              <Input
                required
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase(),
                  })
                }
                placeholder="e.g. COMP"
              />
            </div>
            <div className="space-y-2">
              <Label>Default Duration *</Label>
              <Select
                value={formData.duration}
                onValueChange={(v) => setFormData({ ...formData, duration: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4">4 Years (Standard)</SelectItem>
                  <SelectItem value="5">5 Years</SelectItem>
                  <SelectItem value="6">6 Years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Optional description..."
              />
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
                onClick={() => setIsProgDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingProg ? "Save Changes" : "Create Programme"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
