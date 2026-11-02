"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Plus,
  BookOpen,
  Link,
  Trash,
  Upload,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { TableCard, TableToolbar } from "@/components/shared/table-toolbar";
import { EmptyState, TableSkeleton } from "@/components/shared/states";
import { TablePagination } from "@/components/shared/table-pagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { PageResult } from "@/lib/pagination";
import { toast } from "sonner";
import { BulkImportDialog } from "@/components/imports/bulk-import-dialog";
import {
  MASTER_COURSE_TEMPLATE_COLUMNS,
  MASTER_COURSE_TEMPLATE_EXAMPLES,
  validateMasterCourseImportRows,
  type MasterCourseImportData,
} from "@/lib/imports/courses";

// Types
interface MasterCourse {
  id: string;
  code: string;
  title: string;
  units: number;
  type: string;
  ownership: string;
  level: number;
  semester: number;
  description?: string;
  learningOutcomes?: string[];
  courseContent?: string;
  labWork?: string;
  entrepreneurialAspect?: string;
  discoverable: boolean;
  ownerDepartment?: { id: string; name: string; code: string };
  ownerSchool?: { id: string; name: string; code: string };
  programmeLinks?: {
    id: string;
    isCore: boolean;
    programme: { id: string; name: string; code: string };
  }[];
  prerequisites?: { id: string; code: string; title: string }[];
  _count?: { programmeLinks: number };
}

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Programme {
  id: string;
  name: string;
  code: string;
}

interface MasterCourseManagerProps {
  departmentId?: string;
}

const COURSE_TYPES = [
  { value: "CORE", label: "Core" },
  { value: "GENERAL", label: "General" },
  { value: "ELECTIVE", label: "Elective" },
  { value: "REQUIRED", label: "Required" },
  { value: "GST_NUC", label: "GST (NUC)" },
  { value: "GST_BU", label: "GST (BU)" },
];

const OWNERSHIP_TYPES = [
  { value: "DEPARTMENT", label: "Department" },
  { value: "SCHOOL", label: "School" },
  { value: "INSTITUTIONAL", label: "University-wide" },
];

const LEVELS = [100, 200, 300, 400, 500, 600];
const SEMESTERS = [1, 2];

export function MasterCourseManager({
  departmentId,
}: MasterCourseManagerProps) {
  const { currentUser } = useUser();
  const [courses, setCourses] = useState<MasterCourse[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<MasterCourse | null>(null);
  const [isLinkingCourseId, setIsLinkingCourseId] = useState<string | null>(null);
  const [isTogglingCourseId, setIsTogglingCourseId] = useState<string | null>(null);
  const [isDeletingCourseId, setIsDeletingCourseId] = useState<string | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [isSyncingCcmas, setIsSyncingCcmas] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isEditingCourse, setIsEditingCourse] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: "",
    units: 2,
    level: 100,
    semester: 1,
    description: "",
    learningOutcomes: "",
    courseContent: "",
    labWork: "",
    entrepreneurialAspect: "",
    ownerDeptId: "",
  });
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isFetchingPage, setIsFetchingPage] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const canManageRegistry =
    currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";

  const handleSyncCcmas = async () => {
    if (
      !window.confirm(
        "Load or refresh the official CCMAS catalogue? Courses the university created itself are not changed, and submissions already in progress are not modified.",
      )
    ) {
      return;
    }

    setIsSyncingCcmas(true);
    try {
      const response = await fetch("/api/master-courses/ccmas", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to load the CCMAS catalogue.");
      }
      toast.success(
        `CCMAS catalogue loaded: ${result.created} added, ${result.updated} updated, ${result.linked} programme links.`,
      );
      if (result.skippedUniversityCodes?.length > 0) {
        toast.info(
          `${result.skippedUniversityCodes.length} course code(s) already belong to university-developed courses and were left unchanged.`,
        );
      }
      const reviewCount =
        result.unmatchedProgrammeNames.length +
        result.ambiguousProgrammeNames.length +
        result.reviewProgrammeNames.length;
      if (reviewCount > 0) {
        toast.warning(
          `${reviewCount} source programme name(s) are not configured locally or need manual review. Their courses remain available in the central Registry.`,
        );
      }
      await fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load the CCMAS catalogue.",
      );
    } finally {
      setIsSyncingCcmas(false);
    }
  };

  // New course form state
  const [newCourse, setNewCourse] = useState({
    code: "",
    title: "",
    units: 3,
    type: "CORE",
    ownership: "DEPARTMENT",
    level: 100,
    semester: 1,
    description: "",
    learningOutcomes: [] as string[],
    courseContent: "",
    labWork: "",
    entrepreneurialAspect: "",
    ownerDeptId: departmentId || "",
  });

  const [reloadKey, setReloadKey] = useState(0);
  const fetchData = useCallback(() => {
    setIsFetchingPage(true);
    setReloadKey((k) => k + 1);
  }, []);
  const goToPage = (next: number) => {
    setIsFetchingPage(true);
    setPage(next);
  };

  // Departments and programmes for the forms; loaded once.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/departments"), fetch("/api/programmes")])
      .then(([deptsRes, progsRes]) =>
        Promise.all([
          deptsRes.ok ? deptsRes.json() : null,
          progsRes.ok ? progsRes.json() : null,
        ]),
      )
      .then(([deptsData, progsData]) => {
        if (cancelled) return;
        if (deptsData) setDepartments(deptsData);
        if (progsData) setProgrammes(progsData);
      })
      .catch((error) => console.error("Failed to fetch data:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  // One page of courses at a time; search and filters run on the server.
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (departmentId) params.set("departmentId", departmentId);
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (filterType !== "all") params.set("type", filterType);
    if (filterLevel !== "all") params.set("level", filterLevel);

    fetch(`/api/master-courses?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PageResult<MasterCourse> | null) => {
        if (!data) return;
        setCourses(data.items);
        setTotal(data.total);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") console.error("Failed to fetch courses:", error);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsFetchingPage(false);
        }
      });
    return () => controller.abort();
  }, [departmentId, page, debouncedSearch, filterType, filterLevel, reloadKey]);

  const handleCreateCourse = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/master-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCourse),
      });

      if (res.ok) {
        await res.json();
        fetchData();
        setIsDialogOpen(false);
        setNewCourse({
          code: "",
          title: "",
          units: 3,
          type: "CORE",
          ownership: "DEPARTMENT",
          level: 100,
          semester: 1,
          description: "",
          learningOutcomes: [],
          courseContent: "",
          labWork: "",
          entrepreneurialAspect: "",
          ownerDeptId: departmentId || "",
        });
      }
    } catch (error) {
      console.error("Failed to create course:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const canEditCourse = useCallback(
    (course: MasterCourse) =>
      canManageRegistry ||
      (currentUser?.role === "HOD" &&
        Boolean(currentUser.departmentId) &&
        course.ownership === "INSTITUTIONAL" &&
        ["GST_NUC", "GST_BU"].includes(course.type) &&
        course.ownerDepartment?.id === currentUser.departmentId),
    [canManageRegistry, currentUser],
  );

  const openEditCourse = (course: MasterCourse) => {
    setSelectedCourse(course);
    setEditDraft({
      title: course.title,
      units: course.units,
      level: course.level,
      semester: course.semester,
      description: course.description || "",
      learningOutcomes: (course.learningOutcomes || []).join("\n"),
      courseContent: course.courseContent || course.description || "",
      labWork: course.labWork || "",
      entrepreneurialAspect: course.entrepreneurialAspect || "",
      ownerDeptId: course.ownerDepartment?.id || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditCourse = async () => {
    if (!selectedCourse) return;
    setIsEditingCourse(true);
    try {
      const payload = {
        title: editDraft.title,
        units: editDraft.units,
        level: editDraft.level,
        semester: editDraft.semester,
        description: editDraft.description,
        learningOutcomes: editDraft.learningOutcomes
          .split(/\r?\n|\s*\|\s*/)
          .map((item) => item.trim())
          .filter(Boolean),
        courseContent: editDraft.courseContent,
        labWork: editDraft.labWork,
        entrepreneurialAspect: editDraft.entrepreneurialAspect,
        ...(canManageRegistry ? { ownerDeptId: editDraft.ownerDeptId || null } : {}),
      };
      const response = await fetch(`/api/master-courses/${selectedCourse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to update the Registry course.");
      }
      toast.success(
        `Updated ${selectedCourse.code} and synchronized editable programme submissions.`,
      );
      setEditDialogOpen(false);
      await fetchData();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update the course.",
      );
    } finally {
      setIsEditingCourse(false);
    }
  };

  const handleLinkProgrammes = async (programmeIds: string[]) => {
    if (!selectedCourse) return;
    setIsLinkingCourseId(selectedCourse.id);

    try {
      const res = await fetch(`/api/master-courses/${selectedCourse.id}/programmes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programmeIds }),
      });

      if (res.ok) {
        const linkedProgs = programmes
          .filter((p) => programmeIds.includes(p.id))
          .map((p) => ({
            id: `temp-${p.id}`,
            isCore: false,
            programme: { id: p.id, name: p.name, code: p.code },
          }));

        setCourses((prev) =>
          prev.map((c) =>
            c.id === selectedCourse.id
              ? {
                ...c,
                programmeLinks: [...(c.programmeLinks || []), ...linkedProgs],
                _count: {
                  ...c._count,
                  programmeLinks: (c._count?.programmeLinks || 0) + programmeIds.length,
                },
              }
              : c,
          ),
        );
        setSelectedCourse((prev) =>
          prev
            ? {
              ...prev,
              programmeLinks: [...(prev.programmeLinks || []), ...linkedProgs],
            }
            : prev,
        );
      }

      setLinkDialogOpen(false);
    } catch (error) {
      console.error("Failed to link programmes:", error);
    } finally {
      setIsLinkingCourseId(null);
    }
  };

  const handleUnlinkProgramme = async (programmeId: string) => {
    if (!selectedCourse) return;
    setIsLinkingCourseId(selectedCourse.id);

    try {
      const res = await fetch(`/api/master-courses/${selectedCourse.id}/programmes?programmeId=${programmeId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setCourses((prev) =>
          prev.map((c) => {
            if (c.id === selectedCourse.id) {
              const newLinks = c.programmeLinks?.filter(l => l.programme.id !== programmeId) || [];
              return {
                ...c,
                programmeLinks: newLinks,
                _count: {
                  ...c._count,
                  programmeLinks: newLinks.length,
                },
              };
            }
            return c;
          }),
        );
        setSelectedCourse((prev) =>
          prev
            ? {
              ...prev,
              programmeLinks: prev.programmeLinks?.filter(l => l.programme.id !== programmeId) || [],
            }
            : prev,
        );
      } else {
        const data = await res.json();
        alert(data.error || "Failed to unlink programme");
      }
    } catch (error) {
      console.error("Failed to unlink programme:", error);
    } finally {
      setIsLinkingCourseId(null);
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!confirm("Are you sure you want to delete this master course? This cannot be undone.")) return;
    setIsDeletingCourseId(courseId);

    try {
      const res = await fetch(`/api/master-courses/${courseId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchData();
        if (selectedCourse?.id === courseId) {
          setLinkDialogOpen(false);
          setSelectedCourse(null);
        }
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete course");
      }
    } catch (error) {
      console.error("Failed to delete master course:", error);
      alert("Failed to delete course");
    } finally {
      setIsDeletingCourseId(null);
    }
  };

  const handleToggleDiscoverable = async (course: MasterCourse) => {
    setIsTogglingCourseId(course.id);
    const newValue = !course.discoverable;
    setCourses((prev) =>
      prev.map((c) =>
        c.id === course.id ? { ...c, discoverable: newValue } : c,
      ),
    );
    try {
      const res = await fetch(`/api/master-courses/${course.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discoverable: newValue }),
      });
      if (!res.ok) {
        setCourses((prev) =>
          prev.map((c) =>
            c.id === course.id ? { ...c, discoverable: !newValue } : c,
          ),
        );
      }
    } catch {
      setCourses((prev) =>
        prev.map((c) =>
          c.id === course.id ? { ...c, discoverable: !newValue } : c,
        ),
      );
    } finally {
      setIsTogglingCourseId(null);
    }
  };

  const getCourseTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      CORE: "bg-blue-100 text-blue-800",
      GENERAL: "bg-green-100 text-green-800",
      ELECTIVE: "bg-purple-100 text-purple-800",
      REQUIRED: "bg-orange-100 text-orange-800",
      GST_NUC: "bg-red-100 text-red-800",
      GST_BU: "bg-pink-100 text-pink-800",
    };
    return <Badge className={colors[type] || ""}>{type}</Badge>;
  };

  const getOwnershipBadge = (course: MasterCourse) => {
    const isOwnedByCurrentDept = course.ownerDepartment?.id === departmentId;

    const ownershipColors: Record<string, string> = {
      DEPARTMENT: isOwnedByCurrentDept
        ? "bg-green-100 text-green-800 border-green-300"
        : "bg-amber-100 text-amber-800 border-amber-300",
      SCHOOL: "bg-blue-100 text-blue-800 border-blue-300",
      INSTITUTIONAL: "bg-purple-100 text-purple-800 border-purple-300",
    };

    const ownershipLabels: Record<string, string> = {
      DEPARTMENT: isOwnedByCurrentDept ? "Owned" : "Borrowed",
      SCHOOL: "School-wide",
      INSTITUTIONAL: "University-wide",
    };

    const ownerName =
      course.ownership === "DEPARTMENT" && course.ownerDepartment
        ? course.ownerDepartment.code
        : course.ownership === "SCHOOL" && course.ownerSchool
          ? course.ownerSchool.code
          : course.ownership === "INSTITUTIONAL" && course.ownerDepartment
            ? course.ownerDepartment.code
          : null;

    return (
      <div className="flex flex-col gap-1">
        <Badge className={`${ownershipColors[course.ownership] || ""} border`}>
          {ownershipLabels[course.ownership] || course.ownership}
        </Badge>
        {ownerName && (
          <span className="text-xs text-muted-foreground">
            {course.ownership === "INSTITUTIONAL" ? "hosted by" : "from"}{" "}
            {ownerName}
          </span>
        )}
      </div>
    );
  };

  // The server already applied search, filters and paging.
  const visibleCourses = courses;

  const hasCourseActions = canManageRegistry || currentUser?.role === "HOD";

  const coursesTable = useMemo(() => (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableHead>Code</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Units</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Ownership</TableHead>
          <TableHead>Level</TableHead>
          <TableHead>Sem</TableHead>
          <TableHead>Programmes</TableHead>
          <TableHead className="text-center">Discoverable</TableHead>
          {hasCourseActions && <TableHead>Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {(
          visibleCourses.map((course) => (
            <TableRow key={course.id}>
              <TableCell className="whitespace-nowrap font-mono text-sm font-medium">{course.code}</TableCell>
              <TableCell className="min-w-56">{course.title}</TableCell>
              <TableCell>{course.units}</TableCell>
              <TableCell>{getCourseTypeBadge(course.type)}</TableCell>
              <TableCell>{getOwnershipBadge(course)}</TableCell>
              <TableCell>{course.level}</TableCell>
              <TableCell>{course.semester}</TableCell>
              <TableCell>
                <Badge variant="outline">
                  {course._count?.programmeLinks || 0}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Checkbox
                  aria-label={`${course.code} discoverable`}
                  checked={course.discoverable}
                  onCheckedChange={() => handleToggleDiscoverable(course)}
                  disabled={!canManageRegistry || isTogglingCourseId === course.id}
                />
              </TableCell>
              {hasCourseActions && <TableCell>
                <div className="flex gap-2">
                  {canEditCourse(course) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditCourse(course)}
                      title="Edit course details"
                      aria-label={`Edit ${course.code}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canManageRegistry && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedCourse(course);
                          setLinkDialogOpen(true);
                        }}
                        title="Link Programmes"
                        aria-label={`Link ${course.code} to programmes`}
                      >
                        <Link className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteCourse(course.id)}
                        disabled={isDeletingCourseId === course.id}
                        title="Delete Course"
                        aria-label={`Delete ${course.code}`}
                      >
                        {isDeletingCourseId === course.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash className="h-4 w-4" />
                        )}
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [
    visibleCourses,
    isTogglingCourseId,
    isDeletingCourseId,
    canManageRegistry,
    hasCourseActions,
    canEditCourse,
  ]);

  if (isLoading) return <TableSkeleton columns={6} />;

  const filtersActive =
    search.trim() !== "" || filterType !== "all" || filterLevel !== "all";

  return (
    <div className="space-y-4">
      <TableToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          goToPage(1);
        }}
        searchPlaceholder="Search code or title"
        filters={
          <>
            <Select
              value={filterType}
              onValueChange={(value) => {
                setFilterType(value);
                goToPage(1);
              }}
            >
              <SelectTrigger className="w-full bg-card sm:w-40" aria-label="Course type">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {COURSE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterLevel}
              onValueChange={(value) => {
                setFilterLevel(value);
                goToPage(1);
              }}
            >
              <SelectTrigger className="w-full bg-card sm:w-36" aria-label="Level">
                <SelectValue placeholder="All levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l.toString()}>
                    {l} level
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        actions={
        canManageRegistry && (
          <>
            <Button
              variant="outline"
              onClick={handleSyncCcmas}
              disabled={isSyncingCcmas}
            >
              <RefreshCw className={isSyncingCcmas ? "animate-spin" : ""} />
              {isSyncingCcmas ? "Loading CCMAS..." : "Load CCMAS"}
            </Button>
            <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
              <Upload />
              Bulk upload
            </Button>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              Add course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Master Course</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Course Code</Label>
                <Input
                  placeholder="e.g., COS 101"
                  value={newCourse.code}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, code: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Units</Label>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={newCourse.units}
                  onChange={(e) =>
                    setNewCourse({
                      ...newCourse,
                      units: parseInt(e.target.value),
                    })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Course Title</Label>
                <Input
                  placeholder="e.g., Introduction to computing sciences"
                  value={newCourse.title}
                  onChange={(e) =>
                    setNewCourse({ ...newCourse, title: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={newCourse.type}
                  onValueChange={(v) => setNewCourse({ ...newCourse, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COURSE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ownership</Label>
                <Select
                  value={newCourse.ownership}
                  onValueChange={(v) =>
                    setNewCourse({ ...newCourse, ownership: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OWNERSHIP_TYPES.map((o) => {
                      // Filter out INSTITUTIONAL if not Admin
                      if (
                        o.value === "INSTITUTIONAL" &&
                        currentUser?.role !== "ADMIN" &&
                        currentUser?.role !== "SUPER_ADMIN"
                      ) {
                        return null;
                      }
                      return (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Level</Label>
                <Select
                  value={newCourse.level.toString()}
                  onValueChange={(v) =>
                    setNewCourse({ ...newCourse, level: parseInt(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l.toString()}>
                        {l} Level
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Semester</Label>
                <Select
                  value={newCourse.semester.toString()}
                  onValueChange={(v) =>
                    setNewCourse({ ...newCourse, semester: parseInt(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map((s) => (
                      <SelectItem key={s} value={s.toString()}>
                        {s === 1 ? "First" : "Second"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {["DEPARTMENT", "INSTITUTIONAL"].includes(
                newCourse.ownership,
              ) && (
                <div className="sm:col-span-2">
                  <Label>
                    {newCourse.ownership === "INSTITUTIONAL"
                      ? "Hosting Department (optional)"
                      : "Owner Department"}
                  </Label>
                  <Select
                    value={newCourse.ownerDeptId}
                    onValueChange={(v) =>
                      setNewCourse({ ...newCourse, ownerDeptId: v })
                    }
                  >
                    <SelectTrigger className="[&>span]:truncate">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="sm:col-span-2">
                <Label>Learning Outcomes</Label>
                <Textarea
                  value={newCourse.learningOutcomes.join("\n")}
                  onChange={(event) =>
                    setNewCourse({
                      ...newCourse,
                      learningOutcomes: event.target.value.split(/\r?\n/),
                    })
                  }
                  placeholder="Enter one learning outcome per line"
                  rows={4}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Course Content / Description</Label>
                <Textarea
                  value={newCourse.courseContent}
                  onChange={(event) =>
                    setNewCourse({
                      ...newCourse,
                      courseContent: event.target.value,
                      description: event.target.value,
                    })
                  }
                  placeholder="Provide the centrally maintained course content"
                  rows={5}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateCourse} disabled={isCreating}>
                {isCreating && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </>
        )
        }
      />

      {visibleCourses.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filtersActive ? "No courses match these filters" : "No courses in the registry yet"}
          description={
            filtersActive
              ? "Try a different search or clear the filters."
              : canManageRegistry
                ? "Add courses one at a time or upload a spreadsheet."
                : undefined
          }
        />
      ) : (
        <>
          <TableCard className={isFetchingPage ? "opacity-60 transition-opacity" : undefined}>
            {coursesTable}
          </TableCard>
          <TablePagination
            page={page}
            pageSize={25}
            total={total}
            onPageChange={goToPage}
            noun="courses"
          />
        </>
      )}

        {/* Shared GST details editor. Hosting HoDs can maintain the learning
            details; Academic Planning can also assign the hosting department. */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Edit {selectedCourse?.code || "Registry Course"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Course Title</Label>
                <Input
                  value={editDraft.title}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, title: event.target.value })
                  }
                />
              </div>
              <div>
                <Label>Units</Label>
                <Input
                  type="number"
                  min={1}
                  max={6}
                  value={editDraft.units}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      units: Number(event.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label>Level</Label>
                <Select
                  value={String(editDraft.level)}
                  onValueChange={(value) =>
                    setEditDraft({ ...editDraft, level: Number(value) })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((level) => (
                      <SelectItem key={level} value={String(level)}>
                        {level} Level
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Semester</Label>
                <Select
                  value={String(editDraft.semester)}
                  onValueChange={(value) =>
                    setEditDraft({ ...editDraft, semester: Number(value) })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map((semester) => (
                      <SelectItem key={semester} value={String(semester)}>
                        {semester === 1 ? "First" : "Second"} Semester
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canManageRegistry && selectedCourse?.ownership === "INSTITUTIONAL" && (
                <div>
                  <Label>Hosting Department</Label>
                  <Select
                    value={editDraft.ownerDeptId || "unassigned"}
                    onValueChange={(value) =>
                      setEditDraft({
                        ...editDraft,
                        ownerDeptId: value === "unassigned" ? "" : value,
                      })
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name} ({department.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="sm:col-span-2">
                <Label>Short Registry Summary</Label>
                <Textarea
                  value={editDraft.description}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, description: event.target.value })
                  }
                  rows={2}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Learning Outcomes</Label>
                <Textarea
                  value={editDraft.learningOutcomes}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      learningOutcomes: event.target.value,
                    })
                  }
                  placeholder="Enter one outcome per line"
                  rows={5}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Course Content / Description</Label>
                <Textarea
                  value={editDraft.courseContent}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      courseContent: event.target.value,
                    })
                  }
                  rows={7}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Laboratory or Practical Work</Label>
                <Textarea
                  value={editDraft.labWork}
                  onChange={(event) =>
                    setEditDraft({ ...editDraft, labWork: event.target.value })
                  }
                  rows={3}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Entrepreneurial or Practical Aspect</Label>
                <Textarea
                  value={editDraft.entrepreneurialAspect}
                  onChange={(event) =>
                    setEditDraft({
                      ...editDraft,
                      entrepreneurialAspect: event.target.value,
                    })
                  }
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEditCourse} disabled={isEditingCourse}>
                {isEditingCourse && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save and synchronize
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Link Programmes Dialog */}
        <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Link to Programmes - {selectedCourse?.code}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {programmes.map((prog) => {
                const isLinked = selectedCourse?.programmeLinks?.some(
                  (l) => l.programme.id === prog.id,
                );
                return (
                  <div
                    key={prog.id}
                    className="flex items-center justify-between p-2 border rounded"
                  >
                    <span>
                      {prog.name} ({prog.code})
                    </span>
                    {isLinked ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Linked</Badge>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isLinkingCourseId === selectedCourse?.id}
                          onClick={() => handleUnlinkProgramme(prog.id)}
                        >
                          Unlink
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        disabled={isLinkingCourseId === selectedCourse?.id}
                        onClick={() => handleLinkProgrammes([prog.id])}
                      >
                        {isLinkingCourseId === selectedCourse?.id ? "Linking..." : "Link"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        <BulkImportDialog<MasterCourseImportData>
          open={bulkImportOpen}
          onOpenChange={setBulkImportOpen}
          title="Bulk Upload Registry Courses"
          description="Upload or refresh centrally managed courses, including official CCMAS and university-wide GST courses. Add programme codes to preload courses into the correct programme submissions. Existing course codes are updated without creating duplicates."
          templateFilename="registry-course-bulk-upload-template.xlsx"
          templateColumns={MASTER_COURSE_TEMPLATE_COLUMNS}
          templateRows={MASTER_COURSE_TEMPLATE_EXAMPLES}
          previewColumns={[
            { label: "Code", value: (row) => row.code },
            { label: "Title", value: (row) => row.title },
            { label: "Type", value: (row) => row.type },
            { label: "Ownership", value: (row) => row.ownership },
            { label: "Level", value: (row) => row.level },
          ]}
          validateRows={(rows) =>
            // Checks the file itself here; the server compares it with
            // the whole Registry when it is uploaded.
            validateMasterCourseImportRows(rows, {
              existingCodes: [],
              existingTitles: [],
              allowExisting: true,
            })
          }
          onImport={async (rows) => {
            const response = await fetch("/api/master-courses/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rows }),
            });
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.error || "Failed to import Registry courses.");
            }
            toast.success(
              `${data.imported} new course(s), ${data.updated} updated, and ${data.linked} programme link(s) processed.`,
              {
                description:
                  "Descriptions preloaded into active bulletins will be checked automatically for GRACE compliance.",
              },
            );
            await fetchData();
          }}
        />
    </div>
  );
}

export default MasterCourseManager;
