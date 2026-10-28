"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { TableToolbar } from "@/components/shared/table-toolbar";
import { EmptyState, TableSkeleton } from "@/components/shared/states";
import { usePermission } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    duration: "4",
  });
  const [error, setError] = useState("");

  const canManage = hasPermission("manage:schools");

  const fetchData = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/academic-units")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: School[] | null) => {
        if (!cancelled && data) setSchools(data);
      })
      .catch((err) => console.error("Failed to fetch academic units:", err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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
    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
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

    setDeletingId(id);
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
    } finally {
      setDeletingId(null);
    }
  };

  // Search narrows the tree and opens every branch that has a match.
  const query = search.trim().toLowerCase();
  const matches = (...values: (string | null | undefined)[]) =>
    values.some((v) => v?.toLowerCase().includes(query));
  const visibleSchools = useMemo(() => {
    if (!query) return schools;
    return schools
      .map((school) => {
        if (matches(school.name, school.code)) return school;
        const departments = school.departments
          .map((dept) => {
            if (matches(dept.name, dept.code)) return dept;
            const programmes = dept.programmes.filter((p) => matches(p.name, p.code));
            return programmes.length ? { ...dept, programmes } : null;
          })
          .filter((d): d is Department => d !== null);
        return departments.length ? { ...school, departments } : null;
      })
      .filter((s): s is School => s !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schools, query]);
  const schoolOpen = (id: string) => !!query || expandedSchools.has(id);
  const deptOpen = (id: string) => !!query || expandedDepartments.has(id);

  const allExpanded =
    schools.length > 0 && schools.every((sc) => expandedSchools.has(sc.id));
  const toggleAll = () => {
    if (allExpanded) {
      setExpandedSchools(new Set());
      setExpandedDepartments(new Set());
    } else {
      setExpandedSchools(new Set(schools.map((sc) => sc.id)));
      setExpandedDepartments(
        new Set(schools.flatMap((sc) => sc.departments.map((d) => d.id))),
      );
    }
  };

  const unitTree =
    visibleSchools.length === 0 ? (
      <EmptyState
        icon={SchoolIcon}
        title={query ? "Nothing matches your search" : "No academic units yet"}
        description={
          query
            ? "Try a different name or code."
            : canManage
              ? "Start by adding a school, then its departments and programmes."
              : undefined
        }
        action={
          !query && canManage ? (
            <Button onClick={() => openSchoolForm()}>
              <Plus />
              New school
            </Button>
          ) : undefined
        }
      />
    ) : (
      <div className="space-y-3">
        {visibleSchools.map((school) => {
          const open = schoolOpen(school.id);
          return (
            <Card key={school.id} className="gap-0 overflow-hidden py-0">
              <div className="flex items-center justify-between gap-2 p-3 sm:p-4">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => toggleSchool(school.id)}
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <SchoolIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{school.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {school.code} · {school.departments.length} department
                      {school.departments.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openSchoolForm(school)}
                      disabled={deletingId === school.id}
                      aria-label={`Edit ${school.name}`}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      disabled={deletingId === school.id}
                      onClick={() => handleDelete("school", school.id, school.name)}
                      aria-label={`Delete ${school.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </div>

              {open && (
                <div className="space-y-2 border-t bg-muted/30 p-3 sm:p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Departments
                    </h4>
                    {canManage && (
                      <Button variant="outline" size="sm" className="bg-card" onClick={() => openDeptForm(school.id)}>
                        <Plus />
                        Add department
                      </Button>
                    )}
                  </div>

                  {school.departments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No departments in this school yet.</p>
                  ) : (
                    school.departments.map((dept) => {
                      const deptIsOpen = deptOpen(dept.id);
                      return (
                        <div key={dept.id} className="rounded-lg border bg-card">
                          <div className="flex items-center justify-between gap-2 p-2.5">
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => toggleDept(dept.id)}
                              aria-expanded={deptIsOpen}
                            >
                              {deptIsOpen ? (
                                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                              )}
                              <Building2 className="size-4 shrink-0 text-primary" />
                              <span className="min-w-0 truncate text-sm font-medium">
                                {dept.name}{" "}
                                <span className="font-normal text-muted-foreground">
                                  ({dept.code}) · {dept.programmes.length} programme
                                  {dept.programmes.length === 1 ? "" : "s"}
                                </span>
                              </span>
                            </button>
                            {canManage && (
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  disabled={deletingId === dept.id}
                                  onClick={() => openDeptForm(school.id, dept)}
                                  aria-label={`Edit ${dept.name}`}
                                >
                                  <Pencil />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-destructive hover:text-destructive"
                                  disabled={deletingId === dept.id}
                                  onClick={() => handleDelete("department", dept.id, dept.name)}
                                  aria-label={`Delete ${dept.name}`}
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            )}
                          </div>

                          {deptIsOpen && (
                            <div className="border-t px-3 pb-3">
                              <div className="my-2 flex items-center justify-between">
                                <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Programmes
                                </h5>
                                {canManage && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => openProgForm(dept.id)}
                                  >
                                    <Plus />
                                    Add programme
                                  </Button>
                                )}
                              </div>
                              {dept.programmes.length === 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  No programmes in this department yet.
                                </p>
                              ) : (
                                <ul className="divide-y rounded-md border">
                                  {dept.programmes.map((prog) => (
                                    <li
                                      key={prog.id}
                                      className="flex items-center justify-between gap-2 px-3 py-2"
                                    >
                                      <span className="flex min-w-0 items-center gap-2">
                                        <GraduationCap className="size-4 shrink-0 text-brand-gold" />
                                        <span className="truncate text-sm">
                                          {prog.name}{" "}
                                          <span className="text-muted-foreground">({prog.code})</span>
                                        </span>
                                        {prog.duration && (
                                          <span className="shrink-0 rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                            {prog.duration} yrs
                                          </span>
                                        )}
                                      </span>
                                      {canManage && (
                                        <span className="flex shrink-0 gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7"
                                            disabled={deletingId === prog.id}
                                            onClick={() => openProgForm(dept.id, prog)}
                                            aria-label={`Edit ${prog.name}`}
                                          >
                                            <Pencil className="size-3.5" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="size-7 text-destructive hover:text-destructive"
                                            disabled={deletingId === prog.id}
                                            onClick={() => handleDelete("programme", prog.id, prog.name)}
                                            aria-label={`Delete ${prog.name}`}
                                          >
                                            <Trash2 className="size-3.5" />
                                          </Button>
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    );

  if (isLoading) {
    return <TableSkeleton columns={3} rows={4} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Academic Units"
        description="Schools, their departments, and each department's programmes."
        actions={
          canManage && (
            <Button onClick={() => openSchoolForm()}>
              <Plus />
              New school
            </Button>
          )
        }
      />

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search schools, departments, programmes"
        actions={
          schools.length > 0 &&
          !query && (
            <Button variant="outline" size="sm" className="bg-card" onClick={toggleAll}>
              {allExpanded ? "Collapse all" : "Expand all"}
            </Button>
          )
        }
      />

      {unitTree}

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
                disabled={isSubmitting}
                onClick={() => setIsSchoolDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingSchool ? "Save Changes" : "Create School"}
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
                disabled={isSubmitting}
                onClick={() => setIsDeptDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingDept ? "Save Changes" : "Create Department"}
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
                disabled={isSubmitting}
                onClick={() => setIsProgDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingProg ? "Save Changes" : "Create Programme"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
