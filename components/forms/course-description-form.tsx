"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Save, FileText, Plus, Trash2 } from "lucide-react";

interface Course {
  id: string;
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number;
}

interface CourseDescription {
  id?: string;
  learningOutcomes: string[];
  courseContent: string;
  labWork: string;
}

interface CourseWithDescription extends Course {
  description?: CourseDescription;
}

interface CourseDescriptionFormProps {
  submissionId: string;
  disabled?: boolean;
}

export function CourseDescriptionForm({
  submissionId,
  disabled = false,
}: CourseDescriptionFormProps) {
  const [courses, setCourses] = useState<CourseWithDescription[]>([]);
  const [descriptions, setDescriptions] = useState<
    Record<string, CourseDescription>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingCourseId, setSavingCourseId] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/courses?submissionId=${submissionId}`);
      if (!res.ok) throw new Error("Failed to fetch courses");

      const data: CourseWithDescription[] = await res.json();
      setCourses(data);

      // Build descriptions map
      const descs: Record<string, CourseDescription> = {};
      data.forEach((course) => {
        if (course.description) {
          descs[course.id] = {
            id: course.description.id,
            learningOutcomes: Array.isArray(course.description.learningOutcomes)
              ? course.description.learningOutcomes
              : [],
            courseContent: course.description.courseContent || "",
            labWork: course.description.labWork || "",
          };
        } else {
          descs[course.id] = {
            learningOutcomes: [],
            courseContent: "",
            labWork: "",
          };
        }
      });
      setDescriptions(descs);
    } catch (error) {
      console.error("Failed to fetch courses:", error);
    } finally {
      setIsLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    if (submissionId) {
      fetchCourses();
    }
  }, [submissionId, fetchCourses]);

  const updateDescription = (
    courseId: string,
    field: keyof CourseDescription,
    value: unknown,
  ) => {
    setDescriptions((prev) => ({
      ...prev,
      [courseId]: {
        ...prev[courseId],
        [field]: value,
      },
    }));
  };

  const addLearningOutcome = (courseId: string) => {
    const current = descriptions[courseId]?.learningOutcomes || [];
    updateDescription(courseId, "learningOutcomes", [...current, ""]);
  };

  const removeLearningOutcome = (courseId: string, index: number) => {
    const current = descriptions[courseId]?.learningOutcomes || [];
    const newOutcomes = current.filter((_, i) => i !== index);
    updateDescription(courseId, "learningOutcomes", newOutcomes);
  };

  const updateLearningOutcome = (
    courseId: string,
    index: number,
    value: string,
  ) => {
    const current = descriptions[courseId]?.learningOutcomes || [];
    const newOutcomes = [...current];
    newOutcomes[index] = value;
    updateDescription(courseId, "learningOutcomes", newOutcomes);
  };

  const saveDescription = async (courseId: string) => {
    setSavingCourseId(courseId);
    try {
      const desc = descriptions[courseId];
      await fetch(`/api/courses/${courseId}/description`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learningOutcomes: desc.learningOutcomes.filter((o) => o.trim()),
          courseContent: desc.courseContent,
          labWork: desc.labWork,
        }),
      });
    } catch (error) {
      console.error("Failed to save description:", error);
    } finally {
      setSavingCourseId(null);
    }
  };

  // Group courses by level
  const coursesByLevel = courses.reduce(
    (acc, course) => {
      if (!acc[course.level]) acc[course.level] = [];
      acc[course.level].push(course);
      return acc;
    },
    {} as Record<number, CourseWithDescription[]>,
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (courses.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
          <FileText className="h-6 w-6 mr-2" />
          No courses found. Add courses in the Course Structure section first.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <CardTitle>Course Descriptions</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {Object.entries(coursesByLevel)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([level, levelCourses]) => (
            <div key={level} className="mb-6">
              <h3 className="font-semibold text-lg mb-3">{level} Level</h3>
              <Accordion type="multiple" className="space-y-2">
                {levelCourses
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((course) => {
                    const desc = descriptions[course.id] || {
                      learningOutcomes: [],
                      courseContent: "",
                      labWork: "",
                    };

                    return (
                      <AccordionItem
                        key={course.id}
                        value={course.id}
                        className="border rounded-lg px-4"
                      >
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{course.code}</Badge>
                            <span className="font-medium">{course.title}</span>
                            <Badge variant="secondary">
                              {course.units} units
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pb-4">
                          {/* Learning Outcomes */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Learning Outcomes
                            </label>
                            <p className="text-xs text-muted-foreground">
                              At the end of this course, students should be able
                              to:
                            </p>
                            {desc.learningOutcomes.map((outcome, index) => (
                              <div
                                key={index}
                                className="flex items-start gap-2"
                              >
                                <span className="text-sm text-muted-foreground mt-2 w-6">
                                  {index + 1}.
                                </span>
                                <Input
                                  value={outcome}
                                  onChange={(e) =>
                                    updateLearningOutcome(
                                      course.id,
                                      index,
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Enter learning outcome..."
                                  disabled={disabled}
                                  className="flex-1"
                                />
                                {!disabled && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      removeLearningOutcome(course.id, index)
                                    }
                                    className="text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            {!disabled && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addLearningOutcome(course.id)}
                                className="mt-2"
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Add Outcome
                              </Button>
                            )}
                          </div>

                          <Separator />

                          {/* Course Content */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Course Contents
                            </label>
                            <Textarea
                              value={desc.courseContent}
                              onChange={(e) =>
                                updateDescription(
                                  course.id,
                                  "courseContent",
                                  e.target.value,
                                )
                              }
                              placeholder="Describe the course content, topics covered, etc..."
                              disabled={disabled}
                              rows={4}
                            />
                          </div>

                          {/* Lab Work (optional) */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Lab Work{" "}
                              <span className="text-muted-foreground">
                                (if applicable)
                              </span>
                            </label>
                            <Textarea
                              value={desc.labWork}
                              onChange={(e) =>
                                updateDescription(
                                  course.id,
                                  "labWork",
                                  e.target.value,
                                )
                              }
                              placeholder="Describe practical/lab work requirements..."
                              disabled={disabled}
                              rows={2}
                            />
                          </div>

                          {!disabled && (
                            <div className="flex justify-end pt-2">
                              <Button
                                onClick={() => saveDescription(course.id)}
                                disabled={savingCourseId === course.id}
                                size="sm"
                              >
                                {savingCourseId === course.id ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Save className="h-4 w-4 mr-2" />
                                )}
                                Save Description
                              </Button>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
              </Accordion>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

export default CourseDescriptionForm;
