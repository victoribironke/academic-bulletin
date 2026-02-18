"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Save,
  FileText,
  Plus,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

const GRACE_PILLAR_LABELS: Record<string, string> = {
  G: "Global Relevance",
  R: "Research Focus",
  A: "Adventist Rooted",
  C: "Competent Community",
  E: "Entrepreneurship",
};

function getScoreColor(score: number) {
  if (score >= 4) return "bg-green-500";
  if (score >= 3) return "bg-yellow-500";
  return "bg-red-500";
}

function getScoreBgColor(score: number) {
  if (score >= 4) return "bg-green-50 border-green-200";
  if (score >= 3) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

function GraceResultDisplay({
  result,
}: {
  result: {
    scores: Record<string, number>;
    explanation: string;
    recommendation: string;
    passed: boolean;
  };
}) {
  const hasScores = Object.keys(result.scores).length > 0;

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${result.passed
          ? "bg-green-50 border-green-200"
          : "bg-amber-50 border-amber-200"
        }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        {result.passed ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        )}
        <span
          className={`text-sm font-medium ${result.passed ? "text-green-700" : "text-amber-700"
            }`}
        >
          {result.passed
            ? "GRACE Compliant"
            : "Improvements Needed"}
        </span>
      </div>

      {/* Pillar Scores */}
      {hasScores && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(GRACE_PILLAR_LABELS).map(([key, label]) => {
            const score = result.scores[key];
            if (score === undefined) return null;
            return (
              <div
                key={key}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${getScoreBgColor(score)}`}
              >
                <span className="font-semibold">{key}</span>
                <span className="text-muted-foreground">
                  {label}
                </span>
                <span
                  className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-white text-xs font-bold ${getScoreColor(score)}`}
                >
                  {score}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Explanation */}
      {result.explanation && (
        <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
          {result.explanation
            .replace(/\*\*/g, "")
            .replace(/\* /g, "• ")}
        </div>
      )}

      {/* Recommendation */}
      {result.recommendation && !result.passed && (
        <div className="border-t pt-2 mt-2">
          <p className="text-xs font-medium text-amber-700 mb-1">
            Recommendations:
          </p>
          <div className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
            {result.recommendation
              .replace(/\*\*/g, "")
              .replace(/\* /g, "• ")}
          </div>
        </div>
      )}
    </div>
  );
}

interface Course {
  id: string;
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number;
}

interface GraceResult {
  scores: Record<string, number>;
  explanation: string;
  recommendation: string;
  passed: boolean;
}

interface CourseDescription {
  id?: string;
  learningOutcomes: string[];
  courseContent: string;
  labWork: string;
  entrepreneurialAspect: string;
  gracePass: boolean;
  graceResult: GraceResult | null;
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

  // GRACE compliance check state
  const [graceChecking, setGraceChecking] = useState<string | null>(null);
  const [graceResults, setGraceResults] = useState<
    Record<string, GraceResult>
  >({});

  // Autosave state
  const [dirtyDescriptions, setDirtyDescriptions] = useState<Set<string>>(
    new Set(),
  );
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchCourses = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/courses?submissionId=${submissionId}`);
      if (!res.ok) throw new Error("Failed to fetch courses");

      const data: CourseWithDescription[] = await res.json();
      setCourses(data);

      // Build descriptions map and load persisted GRACE results
      const descs: Record<string, CourseDescription> = {};
      const loadedGrace: Record<string, GraceResult> = {};
      data.forEach((course) => {
        if (course.description) {
          descs[course.id] = {
            id: course.description.id,
            learningOutcomes: Array.isArray(course.description.learningOutcomes)
              ? course.description.learningOutcomes
              : [],
            courseContent: course.description.courseContent || "",
            labWork: course.description.labWork || "",
            entrepreneurialAspect:
              course.description.entrepreneurialAspect || "",
            gracePass: course.description.gracePass || false,
            graceResult: (course.description.graceResult as GraceResult) || null,
          };
          if (course.description.graceResult) {
            loadedGrace[course.id] =
              course.description.graceResult as GraceResult;
          }
        } else {
          descs[course.id] = {
            learningOutcomes: [],
            courseContent: "",
            labWork: "",
            entrepreneurialAspect: "",
            gracePass: false,
            graceResult: null,
          };
        }
      });
      setDescriptions(descs);
      setGraceResults(loadedGrace);
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
    setDirtyDescriptions((prev) => new Set(prev).add(courseId));
  };

  // Autosave: debounced save 3 seconds after last change
  useEffect(() => {
    if (dirtyDescriptions.size === 0 || disabled) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(async () => {
      const toSave = Array.from(dirtyDescriptions);
      for (const courseId of toSave) {
        const desc = descriptions[courseId];
        if (!desc) continue;

        try {
          await fetch(`/api/courses/${courseId}/description`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              learningOutcomes: desc.learningOutcomes.filter((o) => o.trim()),
              courseContent: desc.courseContent,
              labWork: desc.labWork,
              entrepreneurialAspect: desc.entrepreneurialAspect,
              gracePass: desc.gracePass,
              graceResult: desc.graceResult,
            }),
          });
        } catch (error) {
          console.error(`Autosave failed for course ${courseId}:`, error);
        }
      }
      setDirtyDescriptions(new Set());
    }, 3000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [dirtyDescriptions, descriptions, disabled]);

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
          entrepreneurialAspect: desc.entrepreneurialAspect,
          gracePass: desc.gracePass,
          graceResult: desc.graceResult,
        }),
      });
      // Clear from dirty set since we just saved
      setDirtyDescriptions((prev) => {
        const next = new Set(prev);
        next.delete(courseId);
        return next;
      });
    } catch (error) {
      console.error("Failed to save description:", error);
    } finally {
      setSavingCourseId(null);
    }
  };

  const parseGraceAnalysis = (analysis: string) => {
    // Extract JSON scores from the markdown code block
    let scores: Record<string, number> = {};
    const jsonMatch = analysis.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        scores = parsed.GRACE_PILLARS || {};
      } catch {
        // If JSON parsing fails, leave scores empty
      }
    }

    // Extract explanation (between **Explanation:** and **Vision Alignment** or **Recommendation:**)
    const explanationMatch = analysis.match(
      /\*\*Explanation:\*\*\s*([\s\S]*?)(?=\*\*(?:Vision Alignment|Recommendation))/,
    );
    const explanation = explanationMatch
      ? explanationMatch[1].trim()
      : "";

    // Extract recommendation
    const recommendationMatch = analysis.match(
      /\*\*Recommendation:\*\*\s*([\s\S]*?)$/,
    );
    const recommendation = recommendationMatch
      ? recommendationMatch[1].trim()
      : "";

    // Consider "passed" if all scores are >= 3
    const scoreValues = Object.values(scores);
    const passed =
      scoreValues.length > 0 && scoreValues.every((s) => s >= 3);

    return { scores, explanation, recommendation, passed };
  };

  // Persist GRACE result into the description state so autosave picks it up
  const setGraceForCourse = (courseId: string, result: GraceResult) => {
    setGraceResults((prev) => ({ ...prev, [courseId]: result }));
    setDescriptions((prev) => ({
      ...prev,
      [courseId]: {
        ...prev[courseId],
        gracePass: result.passed,
        graceResult: result,
      },
    }));
    setDirtyDescriptions((prev) => new Set(prev).add(courseId));
  };

  const checkGraceCompliance = async (courseId: string, courseTitle: string) => {
    const desc = descriptions[courseId];
    if (!desc?.courseContent?.trim()) return;

    setGraceChecking(courseId);
    setGraceResults((prev) => {
      const next = { ...prev };
      delete next[courseId];
      return next;
    });

    try {
      const res = await fetch("https://santacl-grace.hf.space/check-grace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: courseTitle,
          content: desc.courseContent,
        }),
      });

      if (!res.ok) {
        const fallback: GraceResult = {
          scores: {},
          explanation: "Compliance check failed. Please try again.",
          recommendation: "",
          passed: false,
        };
        setGraceForCourse(courseId, fallback);
      } else {
        const data = await res.json();
        if (data.analysis) {
          const result = parseGraceAnalysis(data.analysis);
          setGraceForCourse(courseId, result);
        } else {
          const fallback: GraceResult = {
            scores: {},
            explanation: "No analysis returned from server.",
            recommendation: "",
            passed: false,
          };
          setGraceForCourse(courseId, fallback);
        }
      }
    } catch {
      const fallback: GraceResult = {
        scores: {},
        explanation:
          "Could not reach the GRACE compliance server. Please try again later.",
        recommendation: "",
        passed: false,
      };
      setGraceForCourse(courseId, fallback);
    } finally {
      setGraceChecking(null);
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
          <CardTitle>Course Details</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          All course descriptions should be <strong>GRACE compliant</strong> as
          proposed by the Vice Chancellor.
        </p>
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
                      entrepreneurialAspect: "",
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

                          {/* Course Description */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <label className="text-sm font-medium">
                                  Course Description
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  Ensure this description is GRACE compliant
                                  (clear, concise, and outcome-focused).
                                </p>
                              </div>
                              {!disabled && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    checkGraceCompliance(
                                      course.id,
                                      course.title,
                                    )
                                  }
                                  disabled={
                                    graceChecking === course.id ||
                                    !desc.courseContent?.trim()
                                  }
                                >
                                  {graceChecking === course.id ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                  ) : (
                                    <ShieldCheck className="h-4 w-4 mr-1" />
                                  )}
                                  Check GRACE
                                </Button>
                              )}
                            </div>
                            <Textarea
                              value={desc.courseContent}
                              onChange={(e) => {
                                updateDescription(
                                  course.id,
                                  "courseContent",
                                  e.target.value,
                                );
                                // Clear GRACE result when content changes
                                if (graceResults[course.id]) {
                                  setGraceResults((prev) => {
                                    const next = { ...prev };
                                    delete next[course.id];
                                    return next;
                                  });
                                  // Also reset persisted GRACE state
                                  setDescriptions((prev) => ({
                                    ...prev,
                                    [course.id]: {
                                      ...prev[course.id],
                                      gracePass: false,
                                      graceResult: null,
                                    },
                                  }));
                                }
                              }}
                              placeholder="Describe the course content, topics covered, and key learning areas. Keep the description GRACE compliant: clear, structured, and focused on student outcomes."
                              disabled={disabled}
                              rows={4}
                            />

                            {/* GRACE Compliance Feedback */}
                            {graceResults[course.id] && (
                              <GraceResultDisplay
                                result={graceResults[course.id]}
                              />
                            )}
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

                          {/* Entrepreneurial/Practical Aspect */}
                          <div className="space-y-2">
                            <label className="text-sm font-medium">
                              Entrepreneurial/Practical Aspect{" "}
                              <span className="text-muted-foreground">
                                (if applicable)
                              </span>
                            </label>
                            <p className="text-xs text-muted-foreground">
                              Describe how students can apply this course
                              commercially, in industry, or in real-world
                              scenarios.
                            </p>
                            <Textarea
                              value={desc.entrepreneurialAspect}
                              onChange={(e) =>
                                updateDescription(
                                  course.id,
                                  "entrepreneurialAspect",
                                  e.target.value,
                                )
                              }
                              placeholder="Describe entrepreneurial applications, practical industry use cases, or commercial opportunities related to this course..."
                              disabled={disabled}
                              rows={3}
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
