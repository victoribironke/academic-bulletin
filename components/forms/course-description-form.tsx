"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Save,
  FileText,
  Plus,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  Pencil,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { GRACE_SUBMISSION_REQUIRED } from "@/lib/grace-config";

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
  onApplySuggestion,
}: {
  result: {
    scores: Record<string, number>;
    pillarSummaries?: Record<string, string>;
    explanation: string;
    recommendation: string;
    passed: boolean;
    suggestedContent?: string;
  };
  onApplySuggestion?: (content: string) => void;
}) {
  const hasScores = Object.keys(result.scores).length > 0;
  const pillarKeys = Object.keys(GRACE_PILLAR_LABELS);
  const hasPillarSummaries = pillarKeys.some(
    (k) => result.pillarSummaries?.[k]?.trim(),
  );

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
          {result.passed ? "GRACE Compliant" : "Improvements Needed"}
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
                <span className="text-muted-foreground">{label}</span>
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

      {hasPillarSummaries && (
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <p className="text-xs font-medium text-muted-foreground">
            Pillar feedback
          </p>
          {pillarKeys.map((key) => {
            const sum = result.pillarSummaries?.[key]?.trim();
            if (!sum) return null;
            return (
              <p key={key} className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">{key}</span>{" "}
                ({GRACE_PILLAR_LABELS[key]}): {sum}
              </p>
            );
          })}
        </div>
      )}

      {/* Explanation */}
      {result.explanation && (
        <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
          {result.explanation.replace(/\*\*/g, "").replace(/\* /g, "• ")}
        </div>
      )}

      {/* Recommendation */}
      {result.recommendation && !result.passed && (
        <div className="border-t pt-2 mt-2">
          <p className="text-xs font-medium text-amber-700 mb-1">
            Recommendations:
          </p>
          <div className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">
            {result.recommendation.replace(/\*\*/g, "").replace(/\* /g, "• ")}
          </div>
        </div>
      )}

      {!result.passed && result.suggestedContent?.trim() && (
        <div className="space-y-3 border-t border-amber-200 pt-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Suggested corrected version
            </p>
            <p className="text-xs text-muted-foreground">
              Review this wording before applying it to the course description.
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border bg-background p-3 text-sm leading-relaxed">
            {result.suggestedContent}
          </div>
          {onApplySuggestion && (
            <Button
              type="button"
              size="sm"
              onClick={() => onApplySuggestion(result.suggestedContent!)}
            >
              Use corrected version
            </Button>
          )}
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
  pillarSummaries?: Record<string, string>;
  explanation: string;
  recommendation: string;
  passed: boolean;
  suggestedContent?: string;
}

interface CourseDescription {
  id?: string;
  learningOutcomes: string[];
  courseContent: string;
  labWork: string;
  entrepreneurialAspect: string;
  gracePass: boolean;
  graceResult: GraceResult | null;
  graceStatus:
    | "PENDING"
    | "CHECKING"
    | "COMPLIANT"
    | "NEEDS_REVISION"
    | "ERROR";
  graceCheckedAt?: string | null;
}

interface GraceProgress {
  total: number;
  missing: number;
  pending: number;
  checking: number;
  compliant: number;
  needsRevision: number;
  error: number;
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
  const [graceResults, setGraceResults] = useState<Record<string, GraceResult>>(
    {},
  );
  const [graceErrors, setGraceErrors] = useState<Record<string, string>>({});
  const [graceProgress, setGraceProgress] = useState<GraceProgress | null>(null);
  const [isProcessingGraceQueue, setIsProcessingGraceQueue] = useState(false);
  const [graceQueueVersion, setGraceQueueVersion] = useState(0);

  // Autosave state
  const [dirtyDescriptions, setDirtyDescriptions] = useState<Set<string>>(
    new Set(),
  );
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dialog state
  const [activeDialogCourseId, setActiveDialogCourseId] = useState<
    string | null
  >(null);

  const fetchCourses = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoading(true);
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
            graceResult:
              (course.description.graceResult as GraceResult) || null,
            graceStatus: course.description.graceStatus || "PENDING",
            graceCheckedAt: course.description.graceCheckedAt || null,
          };
          if (course.description.graceResult) {
            loadedGrace[course.id] = course.description
              .graceResult as GraceResult;
          }
        } else {
          descs[course.id] = {
            learningOutcomes: [],
            courseContent: "",
            labWork: "",
            entrepreneurialAspect: "",
            gracePass: false,
            graceResult: null,
            graceStatus: "PENDING",
          };
        }
      });
      setDescriptions(descs);
      setGraceResults(loadedGrace);
    } catch (error) {
      console.error("Failed to fetch courses:", error);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    if (!submissionId) return;
    const timeoutId = window.setTimeout(() => void fetchCourses(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [submissionId, fetchCourses]);

  useEffect(() => {
    const handleCoursesChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ submissionId?: string }>).detail;
      if (detail?.submissionId !== submissionId) return;
      void fetchCourses(false);
      setGraceQueueVersion((version) => version + 1);
    };
    window.addEventListener("bulletin:courses-changed", handleCoursesChanged);
    return () =>
      window.removeEventListener(
        "bulletin:courses-changed",
        handleCoursesChanged,
      );
  }, [fetchCourses, submissionId]);

  // Bulk uploads, Registry imports, CCMAS, GST, and existing descriptions all
  // enter the same queue. Drain it in small batches while this page is open.
  useEffect(() => {
    if (!submissionId) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsProcessingGraceQueue(true);
      // Checks claimed by another tab or the daily job finish elsewhere, so
      // keep polling a while for them instead of stopping early.
      let idlePolls = 0;
      try {
        while (!cancelled) {
          const response = await fetch("/api/grace-check/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ submissionId, limit: 3 }),
          });
          if (!response.ok) break;
          const data = (await response.json()) as {
            processed: number;
            progress: GraceProgress | null;
          };
          if (cancelled) break;
          setGraceProgress(data.progress);
          if (data.processed > 0) {
            idlePolls = 0;
            await fetchCourses(false);
            continue;
          }
          if (!data.progress?.checking || idlePolls >= 24) break;
          idlePolls += 1;
          await new Promise((resolve) => window.setTimeout(resolve, 5000));
          if (cancelled) break;
          await fetchCourses(false);
        }
      } finally {
        if (!cancelled) setIsProcessingGraceQueue(false);
      }
    }, 750);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [submissionId, fetchCourses, graceQueueVersion]);

  const updateDescription = (
    courseId: string,
    field: keyof CourseDescription,
    value: unknown,
  ) => {
    const invalidatesGrace =
      field === "courseContent" || field === "learningOutcomes";
    setDescriptions((prev) => ({
      ...prev,
      [courseId]: {
        ...prev[courseId],
        [field]: value,
        ...(invalidatesGrace && {
          gracePass: false,
          graceResult: null,
          graceStatus: "PENDING" as const,
          graceCheckedAt: null,
        }),
      },
    }));
    if (invalidatesGrace) {
      setGraceResults((prev) => {
        const next = { ...prev };
        delete next[courseId];
        return next;
      });
      setGraceErrors((prev) => {
        const next = { ...prev };
        delete next[courseId];
        return next;
      });
    }
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
      const saved = new Set<string>();
      for (const courseId of toSave) {
        const desc = descriptions[courseId];
        if (!desc) continue;

        try {
          const res = await fetch(`/api/courses/${courseId}/description`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              learningOutcomes: desc.learningOutcomes.filter((o) => o.trim()),
              courseContent: desc.courseContent,
              labWork: desc.labWork,
              entrepreneurialAspect: desc.entrepreneurialAspect,
            }),
          });
          if (res.ok) {
            const savedDescription = (await res.json()) as CourseDescription;
            setDescriptions((prev) => ({
              ...prev,
              [courseId]: {
                ...prev[courseId],
                gracePass: savedDescription.gracePass,
                graceResult: savedDescription.graceResult,
                graceStatus: savedDescription.graceStatus,
                graceCheckedAt: savedDescription.graceCheckedAt,
              },
            }));
            saved.add(courseId);
          } else {
            console.error(`Autosave failed for course ${courseId}: ${res.status}`);
          }
        } catch (error) {
          console.error(`Autosave failed for course ${courseId}:`, error);
        }
      }
      // Only clear dirty flags for successfully saved descriptions
      if (saved.size > 0) {
        setGraceQueueVersion((version) => version + 1);
        setDirtyDescriptions((prev) => {
          const next = new Set(prev);
          saved.forEach((id) => next.delete(id));
          return next;
        });
      }
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
      const res = await fetch(`/api/courses/${courseId}/description`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learningOutcomes: desc.learningOutcomes.filter((o) => o.trim()),
          courseContent: desc.courseContent,
          labWork: desc.labWork,
          entrepreneurialAspect: desc.entrepreneurialAspect,
        }),
      });
      if (res.ok) {
        const savedDescription = (await res.json()) as CourseDescription;
        setDescriptions((prev) => ({
          ...prev,
          [courseId]: {
            ...prev[courseId],
            gracePass: savedDescription.gracePass,
            graceResult: savedDescription.graceResult,
            graceStatus: savedDescription.graceStatus,
            graceCheckedAt: savedDescription.graceCheckedAt,
          },
        }));
        setGraceQueueVersion((version) => version + 1);
        setDirtyDescriptions((prev) => {
          const next = new Set(prev);
          next.delete(courseId);
          return next;
        });
        setActiveDialogCourseId(null);
      } else {
        console.error("Failed to save description:", res.status);
      }
    } catch (error) {
      console.error("Failed to save description:", error);
    } finally {
      setSavingCourseId(null);
    }
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
        graceStatus: result.passed ? "COMPLIANT" : "NEEDS_REVISION",
      },
    }));
    setDirtyDescriptions((prev) => new Set(prev).add(courseId));
  };

  const checkGraceCompliance = async (courseId: string) => {
    const desc = descriptions[courseId];
    if (!desc?.courseContent?.trim()) return;

    setGraceChecking(courseId);
    setGraceErrors((prev) => {
      const next = { ...prev };
      delete next[courseId];
      return next;
    });
    setGraceResults((prev) => {
      const next = { ...prev };
      delete next[courseId];
      return next;
    });

    try {
      const saveResponse = await fetch(`/api/courses/${courseId}/description`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learningOutcomes: desc.learningOutcomes.filter((o) => o.trim()),
          courseContent: desc.courseContent,
          labWork: desc.labWork,
          entrepreneurialAspect: desc.entrepreneurialAspect,
        }),
      });
      if (!saveResponse.ok) {
        throw new Error("Save the course description before running GRACE.");
      }
      const res = await fetch("/api/grace-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "course",
          courseId,
        }),
      });

      if (res.ok) {
        const result: GraceResult = await res.json();
        setGraceForCourse(courseId, result);
      } else {
        const error = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setGraceErrors((prev) => ({
          ...prev,
          [courseId]:
            error?.error || "The GRACE service could not complete the check.",
        }));
      }
    } catch (error) {
      setGraceErrors((prev) => ({
        ...prev,
        [courseId]:
          error instanceof Error
            ? error.message
            : "Could not reach the GRACE compliance service. Please try again later.",
      }));
    } finally {
      setGraceChecking(null);
    }
  };

  const applyGraceSuggestion = (courseId: string, content: string) => {
    setDescriptions((prev) => ({
      ...prev,
      [courseId]: {
        ...prev[courseId],
        courseContent: content,
        gracePass: false,
        graceResult: null,
        graceStatus: "PENDING",
        graceCheckedAt: null,
      },
    }));
    setGraceResults((prev) => {
      const next = { ...prev };
      delete next[courseId];
      return next;
    });
    setGraceErrors((prev) => {
      const next = { ...prev };
      delete next[courseId];
      return next;
    });
    setDirtyDescriptions((prev) => new Set(prev).add(courseId));
    toast.success("Corrected course description applied", {
      description: "Review it, make any edits you need, then run GRACE again.",
    });
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
          {GRACE_SUBMISSION_REQUIRED ? (
            <>
              All course descriptions should be <strong>GRACE compliant</strong>{" "}
              as proposed by the Vice Chancellor.
            </>
          ) : (
            <>
              GRACE guidance is temporarily optional. Descriptions can be saved
              and the bulletin can be submitted without a completed GRACE check.
            </>
          )}
        </p>
      </CardHeader>
      <CardContent>
        {graceProgress && graceProgress.total > 0 && (
          <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {isProcessingGraceQueue && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              <span className="font-medium">
                {graceProgress.compliant + graceProgress.needsRevision} of{" "}
                {graceProgress.total - graceProgress.missing} courses checked —{" "}
                {graceProgress.compliant} compliant
                {graceProgress.needsRevision > 0 && (
                  <span className="text-amber-700">
                    , {graceProgress.needsRevision} require review
                  </span>
                )}
              </span>
              {graceProgress.error > 0 && (
                <span className="text-destructive">
                  {graceProgress.error} need to be retried
                </span>
              )}
              {graceProgress.missing > 0 && (
                <span className="text-muted-foreground">
                  {graceProgress.missing} have no description yet
                </span>
              )}
            </div>
          </div>
        )}
        {Object.entries(coursesByLevel)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([level, levelCourses]) => (
            <div key={level} className="mb-6">
              <h3 className="font-semibold text-lg mb-3">{level} Level</h3>
              <div className="grid gap-2">
                {levelCourses
                  .sort((a, b) => a.code.localeCompare(b.code))
                  .map((course) => {
                    const desc = descriptions[course.id] || {
                      learningOutcomes: [],
                      courseContent: "",
                      labWork: "",
                      entrepreneurialAspect: "",
                      gracePass: false,
                      graceResult: null,
                      graceStatus: "PENDING" as const,
                    };

                    const hasGraceResult = graceResults[course.id];
                    const isPassed = hasGraceResult?.passed;

                    return (
                      <div
                        key={course.id}
                        className="flex items-center justify-between border rounded-lg p-3 bg-card shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <Badge
                            variant="outline"
                            className="w-20 justify-center"
                          >
                            {course.code}
                          </Badge>
                          <div>
                            <div className="font-medium">
                              {course.title}{" "}
                              <span className="text-muted-foreground font-normal text-sm">
                                ({course.units} units)
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {desc.courseContent ? (
                                <Badge variant="secondary" className="text-xs">
                                  Content added
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="bg-muted text-muted-foreground text-xs"
                                >
                                  No content
                                </Badge>
                              )}

                              {desc.graceStatus === "CHECKING" ||
                              desc.graceStatus === "PENDING" ? (
                                desc.courseContent ? (
                                  <Badge
                                    variant="outline"
                                    className="text-xs text-blue-700 border-blue-200 bg-blue-50"
                                  >
                                    {desc.graceStatus === "CHECKING"
                                      ? "Checking"
                                      : "GRACE check required"}
                                  </Badge>
                                ) : null
                              ) : hasGraceResult ? (
                                <Badge
                                  variant={isPassed ? "default" : "destructive"}
                                  className={
                                    isPassed
                                      ? "bg-green-600 hover:bg-green-700 text-xs"
                                      : "text-xs"
                                  }
                                >
                                  {isPassed
                                    ? "GRACE compliant"
                                    : hasGraceResult.suggestedContent?.trim()
                                      ? "Correction available"
                                      : "Correction required"}
                                </Badge>
                              ) : desc.graceStatus === "ERROR" ? (
                                <Badge
                                  variant="destructive"
                                  className="text-xs"
                                >
                                  Check failed — retry required
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <Dialog
                          open={activeDialogCourseId === course.id}
                          onOpenChange={(open) =>
                            setActiveDialogCourseId(open ? course.id : null)
                          }
                        >
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                              {disabled ? (
                                <FileText className="h-4 w-4 mr-2" />
                              ) : (
                                <Pencil className="h-4 w-4 mr-2" />
                              )}
                              {disabled ? "View Details" : "Edit Details"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2 text-xl">
                                <Badge variant="outline">{course.code}</Badge>
                                {course.title}
                              </DialogTitle>
                            </DialogHeader>

                            <div className="space-y-6 pt-2">
                              {/* Learning Outcomes */}
                              <div className="space-y-2">
                                <label className="text-sm font-semibold">
                                  Learning Outcomes
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  At the end of this course, students should be
                                  able to:
                                </p>
                                {desc.learningOutcomes.map((outcome, index) => (
                                  <div
                                    key={index}
                                    className="flex items-start gap-2"
                                  >
                                    <span className="text-sm text-muted-foreground mt-2 w-6 shrink-0">
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
                                          removeLearningOutcome(
                                            course.id,
                                            index,
                                          )
                                        }
                                        className="text-muted-foreground hover:text-destructive shrink-0"
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
                                    onClick={() =>
                                      addLearningOutcome(course.id)
                                    }
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
                                    <label className="text-sm font-semibold">
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
                                        checkGraceCompliance(course.id)
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
                                    if (graceErrors[course.id]) {
                                      setGraceErrors((prev) => {
                                        const next = { ...prev };
                                        delete next[course.id];
                                        return next;
                                      });
                                    }
                                  }}
                                  placeholder="Describe the course content, topics covered, and key learning areas. Keep the description GRACE compliant: clear, structured, and focused on student outcomes."
                                  disabled={disabled}
                                  rows={5}
                                />

                                {/* GRACE Compliance Feedback */}
                                {graceResults[course.id] && (
                                  <div className="mt-2">
                                    <GraceResultDisplay
                                      result={graceResults[course.id]}
                                      onApplySuggestion={
                                        disabled
                                          ? undefined
                                          : (content) =>
                                              applyGraceSuggestion(
                                                course.id,
                                                content,
                                              )
                                      }
                                    />
                                  </div>
                                )}
                                {graceErrors[course.id] && (
                                  <p className="mt-2 text-sm text-destructive" role="alert">
                                    GRACE service error: {graceErrors[course.id]}
                                  </p>
                                )}
                              </div>

                              {/* Lab Work (optional) */}
                              <div className="space-y-2 pb-2">
                                <label className="text-sm font-semibold">
                                  Lab Work{" "}
                                  <span className="text-muted-foreground font-normal">
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
                              <div className="space-y-2 pb-2">
                                <label className="text-sm font-semibold">
                                  Entrepreneurial/Practical Aspect{" "}
                                  <span className="text-muted-foreground font-normal">
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
                            </div>

                            <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t mt-4">
                              <Button
                                variant="outline"
                                onClick={() => setActiveDialogCourseId(null)}
                              >
                                {disabled ? "Close" : "Cancel"}
                              </Button>
                              {!disabled && (
                                <Button
                                  onClick={() => saveDescription(course.id)}
                                  disabled={savingCourseId === course.id}
                                >
                                  {savingCourseId === course.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Save className="h-4 w-4 mr-2" />
                                  )}
                                  Save & Close
                                </Button>
                              )}
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

export default CourseDescriptionForm;
