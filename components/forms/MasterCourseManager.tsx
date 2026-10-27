"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@/contexts/user-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Loader2, Plus, BookOpen, Link, Trash, Upload } from "lucide-react";
import { toast } from "sonner";
import { BulkImportDialog } from "@/components/imports/bulk-import-dialog";
import {
  MASTER_COURSE_TEMPLATE_COLUMNS,
  MASTER_COURSE_TEMPLATE_EXAMPLES,
  courseDuplicateKeys,
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

const LEVELS = [100, 200, 300, 400, 500];
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

  const canManageRegistry =
    currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";

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
    ownerDeptId: departmentId || "",
  });

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [coursesRes, deptsRes, progsRes] = await Promise.all([
        fetch(
          departmentId
            ? `/api/master-courses?departmentId=${departmentId}`
            : "/api/master-courses",
        ),
        fetch("/api/departments"),
        fetch("/api/programmes"),
      ]);

      if (coursesRes.ok) setCourses(await coursesRes.json());
      if (deptsRes.ok) setDepartments(await deptsRes.json());
      if (progsRes.ok) setProgrammes(await progsRes.json());
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateCourse = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/master-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCourse),
      });

      if (res.ok) {
        const created = await res.json();
        setCourses((prev) => [...prev, created]);
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
          ownerDeptId: departmentId || "",
        });
      }
    } catch (error) {
      console.error("Failed to create course:", error);
    } finally {
      setIsCreating(false);
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
        setCourses((prev) => prev.filter((c) => c.id !== courseId));
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
          : null;

    return (
      <div className="flex flex-col gap-1">
        <Badge className={`${ownershipColors[course.ownership] || ""} border`}>
          {ownershipLabels[course.ownership] || course.ownership}
        </Badge>
        {ownerName && !isOwnedByCurrentDept && (
          <span className="text-xs text-muted-foreground">
            from {ownerName}
          </span>
        )}
      </div>
    );
  };

  const coursesTable = useMemo(() => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Units</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Ownership</TableHead>
          <TableHead>Level</TableHead>
          <TableHead>Sem</TableHead>
          <TableHead>Programmes</TableHead>
          <TableHead className="text-center">Discoverable</TableHead>
          {canManageRegistry && <TableHead>Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {courses.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={canManageRegistry ? 10 : 9}
              className="text-center text-muted-foreground"
            >
              No master courses found. Create one to get started.
            </TableCell>
          </TableRow>
        ) : (
          courses.map((course) => (
            <TableRow key={course.id}>
              <TableCell className="font-mono">{course.code}</TableCell>
              <TableCell>{course.title}</TableCell>
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
                  checked={course.discoverable}
                  onCheckedChange={() => handleToggleDiscoverable(course)}
                  disabled={!canManageRegistry || isTogglingCourseId === course.id}
                />
              </TableCell>
              {canManageRegistry && <TableCell>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedCourse(course);
                      setLinkDialogOpen(true);
                    }}
                    title="Link Programmes"
                  >
                    <Link className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDeleteCourse(course.id)}
                    disabled={isDeletingCourseId === course.id}
                    title="Delete Course"
                  >
                    {isDeletingCourseId === course.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </TableCell>}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [courses, isTogglingCourseId, isDeletingCourseId, canManageRegistry]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <CardTitle>Master Course Registry</CardTitle>
        </div>
        {canManageRegistry && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBulkImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Bulk Upload
            </Button>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Master Course</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
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
              <div className="col-span-2">
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
              {newCourse.ownership === "DEPARTMENT" && (
                <div className="col-span-2">
                  <Label>Owner Department</Label>
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
          </div>
        )}
      </CardHeader>
      <CardContent>
        {coursesTable}

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
          description="Upload centrally managed courses, including university-wide GST courses. Department and school ownership codes must already exist in the system."
          templateFilename="registry-course-bulk-upload-template.csv"
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
            validateMasterCourseImportRows(rows, {
              existingCodes: courses.map(
                (course) => courseDuplicateKeys(course).code,
              ),
              existingTitles: courses.map(
                (course) => courseDuplicateKeys(course).title,
              ),
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
            toast.success(`${data.imported} Registry course(s) imported successfully.`);
            await fetchData();
          }}
        />
      </CardContent>
    </Card>
  );
}

export default MasterCourseManager;
