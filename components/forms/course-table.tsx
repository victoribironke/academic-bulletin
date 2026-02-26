"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DynamicTable, Column } from "./dynamic-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Save, BookOpen, Import } from "lucide-react";

// Updated Course interface - removed lecturerId, added prerequisites
// interface Course {
//   [key: string]: unknown;
//   id?: string;
//   code: string;
//   title: string;
//   units: number;
//   status: "CORE" | "ELECTIVE";
//   semester: number;
//   level: number;
//   prerequisites: string; // Text field for prerequisites
//   masterCourseId?: string;
//   isNew?: boolean;
// }

// Master course from registry
interface MasterCourse {
  id: string;
  code: string;
  title: string;
  units: number;
  type: string;
  level: number;
  semester: number;
  ownership: string;
  ownerDepartment?: { code: string; name: string };
  ownerSchool?: { code: string; name: string };
}

interface CourseTableProps {
  submissionId: string;
  departmentId: string;
  disabled?: boolean;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
}

// Add mandatory property to Course interface
interface Course {
  [key: string]: unknown;
  id?: string;
  code: string;
  title: string;
  units: number;
  status: "CORE" | "ELECTIVE";
  semester: number;
  level: number;
  prerequisites: string;
  masterCourseId?: string;
  isNew?: boolean;
  isMandatory?: boolean; // New flag for locking
}

const LEVELS = [100, 200, 300, 400, 500, 600];

export function CourseTable({
  submissionId,
  departmentId,
  disabled = false,
  onValidationChange,
}: CourseTableProps) {
  const [coursesByLevel, setCoursesByLevel] = useState<
    Record<number, Course[]>
  >({
    100: [],
    200: [],
    300: [],
    400: [],
    500: [],
    600: [],
  });
  const [originalCourseIds, setOriginalCourseIds] = useState<Set<string>>(
    new Set(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeLevel, setActiveLevel] = useState("100");

  // Import from registry state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [masterCourses, setMasterCourses] = useState<MasterCourse[]>([]);
  const [selectedMasterCourses, setSelectedMasterCourses] = useState<
    Set<string>
  >(new Set());
  const [isLoadingMasterCourses, setIsLoadingMasterCourses] = useState(false);
  const [registryScope, setRegistryScope] = useState<"context" | "all">(
    "context",
  ); // Scope filter

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);

      const coursesRes = await fetch(
        `/api/courses?submissionId=${submissionId}`,
      );

      if (!coursesRes.ok) throw new Error("Failed to fetch courses");

      const courses = await coursesRes.json();

      const grouped: Record<number, Course[]> = {
        100: [],
        200: [],
        300: [],
        400: [],
        500: [],
        600: [],
      };
      const ids = new Set<string>();
      courses.forEach((course: Course) => {
        if (grouped[course.level]) {
          grouped[course.level].push(course);
        }
        if (course.id) {
          ids.add(course.id);
        }
      });

      setCoursesByLevel(grouped);
      setOriginalCourseIds(ids);
      setOriginalCourseIds(ids);

      // Check for mandatory courses to inject
      if (departmentId) {
        // Fetch all context courses including mandatory ones
        const masterRes = await fetch(
          `/api/master-courses?departmentId=${departmentId}`,
        );
        if (masterRes.ok) {
          const masterData: MasterCourse[] = await masterRes.json();
          const mandatoryCourses = masterData.filter(
            (mc) => mc.ownership === "INSTITUTIONAL",
          );

          // Inject missing mandatory courses
          const newCoursesByLevel = { ...grouped };
          let added = false;

          mandatoryCourses.forEach((mc) => {
            // Check if already present in any level
            let exists = false;
            LEVELS.forEach((l) => {
              if (grouped[l]?.some((c) => c.code === mc.code)) exists = true;
            });

            if (!exists) {
              const level = mc.level as 100 | 200 | 300 | 400 | 500 | 600;
              if (!newCoursesByLevel[level]) newCoursesByLevel[level] = [];

              newCoursesByLevel[level].push({
                code: mc.code,
                title: mc.title,
                units: mc.units,
                status: "CORE", // Mandatory are always CORE
                semester: mc.semester,
                level: mc.level,
                prerequisites: "",
                masterCourseId: mc.id,
                isNew: true,
                isMandatory: true,
              });
              added = true;
            }
          });

          // Mark existing courses as mandatory if they match
          LEVELS.forEach((l) => {
            newCoursesByLevel[l] = newCoursesByLevel[l].map((c) => {
              const match = mandatoryCourses.find((mc) => mc.code === c.code);
              if (match) return { ...c, isMandatory: true };
              return c;
            });
          });

          if (added) {
            setCoursesByLevel(newCoursesByLevel);
          } else {
            // If we just mapped existing to mandatory without adding new ones, update state
            setCoursesByLevel(newCoursesByLevel);
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [submissionId, departmentId]);

  useEffect(() => {
    if (submissionId && departmentId) {
      fetchData();
    }
  }, [submissionId, departmentId, fetchData]);

  // Validate courses - basic and uniqueness validation
  useEffect(() => {
    const errors: string[] = [];
    let hasIncompleteCourses = false;

    const seenCodes = new Set<string>();
    const seenTitles = new Set<string>();
    const duplicateCodes = new Set<string>();
    const duplicateTitles = new Set<string>();

    LEVELS.forEach((level) => {
      const courses = coursesByLevel[level] || [];
      courses.forEach((course) => {
        const code = course.code?.trim().toUpperCase();
        const title = course.title?.trim().toLowerCase();

        if (code && !course.title?.trim()) hasIncompleteCourses = true;

        if (code) {
          if (seenCodes.has(code)) duplicateCodes.add(code);
          seenCodes.add(code);
        }

        if (title) {
          if (seenTitles.has(title)) duplicateTitles.add(title);
          seenTitles.add(title);
        }
      });
    });

    if (hasIncompleteCourses) {
      errors.push("All courses must have both code and title");
    }

    if (duplicateCodes.size > 0) {
      errors.push(
        `Duplicate course codes found: ${Array.from(duplicateCodes).join(", ")}`,
      );
    }

    if (duplicateTitles.size > 0) {
      errors.push(
        `Duplicate course titles found. Each course must have a unique title.`,
      );
    }

    onValidationChange?.(errors.length === 0, errors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coursesByLevel]);

  const createEmptyCourse = (level: number): Course => ({
    code: "",
    title: "",
    units: 2,
    status: "CORE",
    semester: 1,
    level,
    prerequisites: "",
    isNew: true,
  });

  // Fetch master courses for import dialog
  const fetchMasterCourses = async () => {
    setIsLoadingMasterCourses(true);
    try {
      // Fetch based on scope
      let url = `/api/master-courses?departmentId=${departmentId}`;
      if (registryScope === "all") {
        url = `/api/master-courses?scope=all`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMasterCourses(data);
      }
    } catch (error) {
      console.error("Failed to fetch master courses:", error);
    } finally {
      setIsLoadingMasterCourses(false);
    }
  };

  // Effect to refetch when scope changes if dialog is open
  useEffect(() => {
    if (importDialogOpen) {
      fetchMasterCourses();
    }
  }, [registryScope]);

  // Open import dialog and load courses
  const openImportDialog = async () => {
    setImportDialogOpen(true);
    setSelectedMasterCourses(new Set());
    await fetchMasterCourses();
  };

  // Toggle master course selection
  const toggleMasterCourseSelection = (courseId: string) => {
    setSelectedMasterCourses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(courseId)) {
        newSet.delete(courseId);
      } else {
        newSet.add(courseId);
      }
      return newSet;
    });
  };

  // Import selected master courses
  const importSelectedCourses = () => {
    const selectedCourses = masterCourses.filter((mc) =>
      selectedMasterCourses.has(mc.id),
    );

    // Get existing course codes to avoid duplicates
    const existingCodes = new Set<string>();
    LEVELS.forEach((level) => {
      (coursesByLevel[level] || []).forEach((c) => {
        existingCodes.add(c.code);
      });
    });

    // Add each selected course to the appropriate level
    const newCoursesByLevel = { ...coursesByLevel };

    selectedCourses.forEach((mc) => {
      // Skip if already exists
      if (existingCodes.has(mc.code)) return;

      const level = mc.level as 100 | 200 | 300 | 400 | 500 | 600;
      if (!newCoursesByLevel[level]) newCoursesByLevel[level] = [];

      const newCourse: Course = {
        code: mc.code,
        title: mc.title,
        units: mc.units,
        status: mc.type === "ELECTIVE" ? "ELECTIVE" : "CORE",
        semester: mc.semester,
        level: mc.level,
        prerequisites: "",
        masterCourseId: mc.id,
        isNew: true,
      };

      newCoursesByLevel[level] = [...newCoursesByLevel[level], newCourse];
    });

    setCoursesByLevel(newCoursesByLevel);
    setImportDialogOpen(false);
    setSelectedMasterCourses(new Set());
  };

  // Build columns - removed lecturer, added prerequisites
  const getColumns = (): Column<Course>[] => [
    {
      key: "code",
      header: "Course Code",
      type: "text",
      placeholder: "e.g., COS 101",
      required: true,
      width: "120px",
    },
    {
      key: "title",
      header: "Course Title",
      type: "text",
      placeholder: "e.g., Introduction to computing sciences",
      required: true,
    },
    {
      key: "status",
      header: "Status",
      type: "select",
      options: [
        { value: "CORE", label: "Core (C)" },
        { value: "ELECTIVE", label: "Elective (E)" },
      ],
      required: true,
      width: "100px",
    },
    {
      key: "semester",
      header: "Semester",
      type: "select",
      options: [
        { value: "1", label: "1st" },
        { value: "2", label: "2nd" },
      ],
      required: true,
      width: "90px",
    },
    {
      key: "units",
      header: "Units",
      type: "number",
      required: true,
      width: "70px",
    },
    {
      key: "prerequisites",
      header: "Prerequisites",
      type: "text",
      placeholder: "e.g., COS 101, MTH 101",
      width: "200px",
    },
  ];

  const handleLevelChange = (level: number, courses: Course[]) => {
    setCoursesByLevel((prev) => ({ ...prev, [level]: courses }));
  };

  const saveCourses = async () => {
    setIsSaving(true);
    try {
      // Collect all current course IDs to find deleted ones
      const currentCourseIds = new Set<string>();

      for (const level of LEVELS) {
        const courses = coursesByLevel[level] || [];

        for (const course of courses) {
          if (!course.code.trim() || !course.title.trim()) continue;

          // Track existing course IDs
          if (course.id && !course.isNew) {
            currentCourseIds.add(course.id);
          }

          const courseData = {
            ...course,
            semester:
              typeof course.semester === "string"
                ? parseInt(course.semester)
                : course.semester,
            submissionId,
          };

          if (course.isNew || !course.id) {
            // Try to find matching master course first
            let masterCourseId = undefined;
            try {
              const search = await fetch(
                `/api/master-courses?code=${course.code}`,
              );
              if (search.ok) {
                const results = await search.json();
                const match = results.find(
                  (m: MasterCourse) => m.code === course.code,
                );
                if (match) masterCourseId = match.id;
              }
            } catch (e) {
              // Ignore lookup error
              console.error("Failed to find matching master course:", e);
            }

            await fetch("/api/courses", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...courseData, masterCourseId }),
            });
          } else {
            await fetch(`/api/courses/${course.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(courseData),
            });
          }
        }
      }

      // Delete courses that were removed
      for (const originalId of originalCourseIds) {
        if (!currentCourseIds.has(originalId)) {
          await fetch(`/api/courses/${originalId}`, {
            method: "DELETE",
          });
        }
      }

      await fetchData();
    } catch (error) {
      console.error("Failed to save courses:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate totals
  const getTotals = (level: number) => {
    const courses = coursesByLevel[level] || [];
    const sem1 = courses.filter(
      (c) => c.semester === 1 || c.semester.toString() === "1",
    );
    const sem2 = courses.filter(
      (c) => c.semester === 2 || c.semester.toString() === "2",
    );

    return {
      sem1Units: sem1.reduce((sum, c) => sum + (c.units || 0), 0),
      sem2Units: sem2.reduce((sum, c) => sum + (c.units || 0), 0),
      total: courses.reduce((sum, c) => sum + (c.units || 0), 0),
    };
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
          <CardTitle>Course Structure</CardTitle>
        </div>
        {!disabled && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openImportDialog}>
              <Import className="h-4 w-4 mr-2" />
              Import from Registry
            </Button>
            <Button onClick={saveCourses} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save All
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeLevel} onValueChange={setActiveLevel}>
          <div className="overflow-x-auto">
            <TabsList className="mb-4 w-max">
              {LEVELS.map((level) => (
                <TabsTrigger
                  key={level}
                  value={level.toString()}
                  className="flex items-center gap-2"
                >
                  {level} Level
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {LEVELS.map((level) => {
            const totals = getTotals(level);
            return (
              <TabsContent key={level} value={level.toString()}>
                <div className="overflow-x-auto">
                  <DynamicTable<Course>
                    columns={getColumns()}
                    data={coursesByLevel[level] || []}
                    onChange={(courses) =>
                      handleLevelChange(level, courses as Course[])
                    }
                    createEmptyRow={() => createEmptyCourse(level)}
                    disabled={disabled}
                    isRowLocked={(row) => !!row.isMandatory} // Lock mandatory rows
                  />
                </div>

                <div className="mt-4 flex justify-end gap-4 text-sm text-muted-foreground">
                  <span>
                    1st Semester: <strong>{totals.sem1Units}</strong> units
                  </span>
                  <span>
                    2nd Semester: <strong>{totals.sem2Units}</strong> units
                  </span>
                  <span>
                    Total: <strong>{totals.total}</strong> units
                  </span>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>

      {/* Import from Registry Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Import Courses from Registry</DialogTitle>
          </DialogHeader>

          <div className="px-6 py-2 border-b">
            <Tabs
              value={registryScope}
              onValueChange={(v) => setRegistryScope(v as "context" | "all")}
            >
              <TabsList className="w-full">
                <TabsTrigger value="context" className="flex-1">
                  Recommended
                </TabsTrigger>
                <TabsTrigger value="all" className="flex-1">
                  All Courses
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoadingMasterCourses ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : masterCourses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No courses found in the registry for this department.
                <br />
                <span className="text-sm">
                  Ask an administrator to add courses to the Master Course
                  Registry.
                </span>
              </div>
            ) : (
              <ScrollArea className="h-full max-h-[50vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="whitespace-nowrap">Code</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead className="whitespace-nowrap">Units</TableHead>
                      <TableHead className="whitespace-nowrap">Level</TableHead>
                      <TableHead className="whitespace-nowrap">Sem</TableHead>
                      <TableHead className="whitespace-nowrap">Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {masterCourses.map((mc) => {
                      // Check if already added
                      const existingCodes = new Set<string>();
                      LEVELS.forEach((level) => {
                        (coursesByLevel[level] || []).forEach((c) => {
                          existingCodes.add(c.code);
                        });
                      });
                      const isAlreadyAdded = existingCodes.has(mc.code);

                      return (
                        <TableRow
                          key={mc.id}
                          className={isAlreadyAdded ? "opacity-50" : ""}
                        >
                          <TableCell className="p-2">
                            <Checkbox
                              checked={selectedMasterCourses.has(mc.id)}
                              onCheckedChange={() =>
                                toggleMasterCourseSelection(mc.id)
                              }
                              disabled={isAlreadyAdded}
                            />
                          </TableCell>
                          <TableCell className="font-mono whitespace-nowrap p-2">
                            {mc.code}
                          </TableCell>
                          <TableCell className="p-2">{mc.title}</TableCell>
                          <TableCell className="p-2">{mc.units}</TableCell>
                          <TableCell className="p-2">{mc.level}</TableCell>
                          <TableCell className="p-2">{mc.semester}</TableCell>
                          <TableCell className="p-2">
                            <Badge
                              variant="outline"
                              className={
                                mc.type === "CORE"
                                  ? "bg-blue-50"
                                  : mc.type === "ELECTIVE"
                                    ? "bg-purple-50"
                                    : mc.type === "GENERAL"
                                      ? "bg-green-50"
                                      : ""
                              }
                            >
                              {mc.type}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t pt-4">
            <div className="flex items-center justify-between w-full">
              <span className="text-sm text-muted-foreground">
                {selectedMasterCourses.size} course(s) selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setImportDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={importSelectedCourses}
                  disabled={selectedMasterCourses.size === 0}
                >
                  Import Selected
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default CourseTable;
