"use client";

import React, { useState, useEffect, useCallback } from "react";
import { DynamicTable, Column } from "./dynamic-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, BookOpen } from "lucide-react";

// Updated Course interface - removed lecturerId, added prerequisites
interface Course {
  [key: string]: unknown;
  id?: string;
  code: string;
  title: string;
  units: number;
  status: "CORE" | "ELECTIVE";
  semester: number;
  level: number;
  prerequisites: string; // Text field for prerequisites
  isNew?: boolean;
}

interface CourseTableProps {
  submissionId: string;
  departmentId: string;
  disabled?: boolean;
  onValidationChange?: (isValid: boolean, errors: string[]) => void;
}

const LEVELS = [100, 200, 300, 400];

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
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeLevel, setActiveLevel] = useState("100");

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);

      const coursesRes = await fetch(
        `/api/courses?submissionId=${submissionId}`,
      );

      if (!coursesRes.ok) throw new Error("Failed to fetch courses");

      const courses = await coursesRes.json();

      // Group courses by level
      const grouped: Record<number, Course[]> = {
        100: [],
        200: [],
        300: [],
        400: [],
      };
      courses.forEach((course: Course) => {
        if (grouped[course.level]) {
          grouped[course.level].push(course);
        }
      });

      setCoursesByLevel(grouped);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    if (submissionId && departmentId) {
      fetchData();
    }
  }, [submissionId, departmentId, fetchData]);

  // Validate courses - basic validation
  useEffect(() => {
    const errors: string[] = [];
    let hasIncompleteCourses = false;

    LEVELS.forEach((level) => {
      const courses = coursesByLevel[level] || [];
      courses.forEach((course) => {
        if (course.code && !course.title) {
          hasIncompleteCourses = true;
        }
      });
    });

    if (hasIncompleteCourses) {
      errors.push("All courses must have both code and title");
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
      for (const level of LEVELS) {
        const courses = coursesByLevel[level] || [];

        for (const course of courses) {
          if (!course.code.trim() || !course.title.trim()) continue;

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
                const match = results.find((m: any) => m.code === course.code);
                if (match) masterCourseId = match.id;
              }
            } catch (e) {
              // Ignore lookup error
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
          <Button onClick={saveCourses} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save All
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeLevel} onValueChange={setActiveLevel}>
          <TabsList className="mb-4">
            {LEVELS.map((level) => {
              const totals = getTotals(level);
              return (
                <TabsTrigger
                  key={level}
                  value={level.toString()}
                  className="flex items-center gap-2"
                >
                  {level} Level
                  <Badge variant="secondary" className="ml-1">
                    {totals.total} units
                  </Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {LEVELS.map((level) => {
            const totals = getTotals(level);
            return (
              <TabsContent key={level} value={level.toString()}>
                <DynamicTable<Course>
                  columns={getColumns()}
                  data={coursesByLevel[level] || []}
                  onChange={(courses) =>
                    handleLevelChange(level, courses as Course[])
                  }
                  createEmptyRow={() => createEmptyCourse(level)}
                  disabled={disabled}
                />

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
    </Card>
  );
}

export default CourseTable;
