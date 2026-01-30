"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { Loader2, Plus, BookOpen, Link } from "lucide-react";

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
  { value: "INSTITUTIONAL", label: "Institutional" },
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
  const [selectedCourse, setSelectedCourse] = useState<MasterCourse | null>(
    null,
  );

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
        body: JSON.stringify({
          ...newCourse,
          userRole: currentUser?.role,
        }),
      });

      if (res.ok) {
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
        await fetchData();
      }
    } catch (error) {
      console.error("Failed to create course:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleLinkProgrammes = async (programmeIds: string[]) => {
    if (!selectedCourse) return;

    try {
      await fetch(`/api/master-courses/${selectedCourse.id}/programmes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programmeIds }),
      });

      setLinkDialogOpen(false);
      await fetchData();
    } catch (error) {
      console.error("Failed to link programmes:", error);
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
                    <SelectTrigger>
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
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Units</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Sem</TableHead>
              <TableHead>Programmes</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {courses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
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
                  <TableCell>{course.level}</TableCell>
                  <TableCell>{course.semester}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {course._count?.programmeLinks || 0}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedCourse(course);
                          setLinkDialogOpen(true);
                        }}
                      >
                        <Link className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

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
                      <Badge variant="secondary">Linked</Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleLinkProgrammes([prog.id])}
                      >
                        Link
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default MasterCourseManager;
