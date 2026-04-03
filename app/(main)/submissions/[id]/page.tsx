"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import Link from "next/link";
import { useUser, usePermission } from "@/contexts/user-context";
import {
  RichTextEditor,
  RichTextViewer,
} from "@/components/editor/rich-text-editor";
import { StaffTable } from "@/components/forms/staff-table";
import { CourseTable } from "@/components/forms/course-table";
import { CourseDescriptionForm } from "@/components/forms/course-description-form";
import { BulletinPreview } from "@/components/preview/bulletin-preview";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ArrowLeft,
  Save,
  Send,
  CheckCircle,
  XCircle,
  RotateCcw,
  MessageSquare,
  Clock,
  Loader2,
  Plus,
  AlertCircle,
  Users,
  BookOpen,
  FileText,
  GraduationCap,
  Building,
  Target,
  ClipboardList,
  Cloud,
  CloudOff,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

interface Submission {
  id: string;
  title: string;

  currentPhase: number;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  submittedAt: string | null;
  approvedAt: string | null;
  programme: {
    id: string;
    name: string;
    code: string;
    department: {
      id: string;
      name: string;
      school: { id: string; name: string; code: string };
    };
  };
  createdBy: {
    firstName: string;
    lastName: string;
    role: string;
  };
  content: {
    programmeInfo?: { deanImageUrl?: string; hodImageUrl?: string; };
    philosophy?: string;
    objectives?: string[];
    uniqueFeatures?: string[];
    employability?: string;
    centurySkills?: string[];
    utmeRequirements?: string;
    directEntryRequirements?: string;
    transferRequirements?: string;
    minimumDuration?: string;
    graduationRequirements?: string;
    minimumCGPA?: number;
    totalUnits?: number;
    // Legacy sections
    sectionA?: { content?: string };
    sectionB?: { content?: string };
    sectionC?: { content?: string };
    sectionD?: { content?: string };
    sectionE?: { content?: string };
    sectionF?: { content?: string };
    sectionG?: { content?: string };
    sectionH?: { content?: string };
  } | null;
  comments: Comment[];
  phaseTransitions: PhaseTransition[];
}

interface Comment {
  id: string;
  content: string;
  section: string | null;
  phase: number;
  type: "SUGGESTION" | "ISSUE" | "QUESTION" | "APPROVAL";
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  author: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

interface PhaseTransition {
  id: string;
  fromPhase: number;
  toPhase: number;
  action: string;
  remarks: string | null;
  transitionedAt: string;
  performedBy: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

// Updated section structure based on template
const sections = [
  {
    key: "deans_hods",
    title: "Deans & HODs",
    icon: Users,
    description: "Profiles of the Dean and Head of Department",
  },
  {
    key: "staff",
    title: "Staff Directory",
    icon: Users,
    description: "Academic, Adjunct Academic, and Non-Academic Staff",
  },
  {
    key: "overview",
    title: "Programme Overview",
    icon: Building,
    description: "Philosophy, Objectives, Unique Features",
  },
  {
    key: "admission",
    title: "Admission Requirements",
    icon: GraduationCap,
    description: "UTME, Direct Entry, Transfer requirements",
  },
  {
    key: "graduation",
    title: "Graduation Requirements",
    icon: Target,
    description: "Credit units, minimum CGPA",
  },
  {
    key: "courses",
    title: "Course Structure",
    icon: BookOpen,
    description: "Courses by level with lecturers",
  },
  {
    key: "descriptions",
    title: "Course Details",
    icon: FileText,
    description: "Learning outcomes and content",
  },
  {
    key: "regulations",
    title: "Regulations & Changes",
    icon: ClipboardList,
    description: "Programme regulations, summary of changes",
  },
];

const phaseNames: Record<number, string> = {
  1: "Preparation",
  2: "Departmental Review",
  3: "School Approval",
  4: "Academic Planning Review",
  5: "Corrections",
  6: "Final Consolidation",
  7: "Senate Approval",
  8: "Editing",
  9: "Typesetting",
  10: "Distribution",
  11: "Post-Release",
};

const commentTypeColors: Record<string, string> = {
  SUGGESTION: "bg-blue-100 text-blue-800",
  ISSUE: "bg-red-100 text-red-800",
  QUESTION: "bg-yellow-100 text-yellow-800",
  APPROVAL: "bg-green-100 text-green-800",
};

const GRACE_PILLAR_LABELS: Record<string, string> = {
  G: "Global Relevance",
  R: "Research Focus",
  A: "Adventist Rooted",
  C: "Competent Community",
  E: "Entrepreneurship",
};

function GraceResultPanel({
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

  const getScoreColor = (score: number) => {
    if (score >= 4) return "bg-green-500";
    if (score >= 3) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 4) return "bg-green-50 border-green-200";
    if (score >= 3) return "bg-yellow-50 border-yellow-200";
    return "bg-red-50 border-red-200";
  };

  return (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        result.passed
          ? "bg-green-50 border-green-200"
          : "bg-amber-50 border-amber-200"
      }`}
    >
      <div className="flex items-center gap-2">
        {result.passed ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        )}
        <span
          className={`text-sm font-medium ${
            result.passed ? "text-green-700" : "text-amber-700"
          }`}
        >
          {result.passed ? "GRACE Compliant" : "Improvements Needed"}
        </span>
      </div>

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

      {result.explanation && (
        <div className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
          {result.explanation.replace(/\*\*/g, "").replace(/\* /g, "• ")}
        </div>
      )}

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
    </div>
  );
}

export default function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { currentUser } = useUser();
  const { hasPermission } = usePermission();

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("staff");
  const [hasChanges, setHasChanges] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Form state for structured sections
  const [deanImageUrl, setDeanImageUrl] = useState("");
  const [hodImageUrl, setHodImageUrl] = useState("");
  const [philosophy, setPhilosophy] = useState("");
  const [mission, setMission] = useState("");
  const [vision, setVision] = useState("");
  const [objectives, setObjectives] = useState<string[]>([""]);
  const [uniqueFeatures, setUniqueFeatures] = useState<string[]>([""]);
  const [employability, setEmployability] = useState<string[]>([""]);
  const [utmeRequirements, setUtmeRequirements] = useState("");
  const [directEntryRequirements, setDirectEntryRequirements] = useState("");
  const [transferRequirements, setTransferRequirements] = useState("");
  const [minimumDuration, setMinimumDuration] = useState("");
  const [graduationRequirements, setGraduationRequirements] = useState("");
  const [minimumCGPA, setMinimumCGPA] = useState<number>(2.5);
  const [totalUnits, setTotalUnits] = useState<number>(154);
  const [regulations, setRegulations] = useState("");
  const [summaryOfChanges, setSummaryOfChanges] = useState("");

  // GRACE compliance check state
  const [graceCheckingPhilosophy, setGraceCheckingPhilosophy] = useState(false);
  const [gracePhilosophyResult, setGracePhilosophyResult] = useState<{
    scores: Record<string, number>;
    explanation: string;
    recommendation: string;
    passed: boolean;
  } | null>(null);

  // Comments state
  const [newComment, setNewComment] = useState("");
  const [commentType, setCommentType] = useState<string>("SUGGESTION");
  const [isAddingComment, setIsAddingComment] = useState(false);

  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const canEdit =
    hasPermission("edit:submission") && submission?.status === "DRAFT";
  const canComment =
    hasPermission("comment:submission") || hasPermission("review:submission");
  const canReview = hasPermission("review:submission");
  const canApprove = hasPermission("approve:submission");
  // Only HOD and Super Admin can officially submit (not coordinators or regular admins)
  const canSubmit =
    currentUser &&
    ["HOD", "SUPER_ADMIN"].includes(currentUser.role) &&
    submission?.status === "DRAFT";

  const fetchSubmission = useCallback(async () => {
    try {
      const response = await fetch(`/api/submissions/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSubmission(data);
        // Initialize form state from submission content
        if (data.content) {
          setDeanImageUrl(data.content.programmeInfo?.deanImageUrl || "");
          setHodImageUrl(data.content.programmeInfo?.hodImageUrl || "");
          setPhilosophy(data.content.philosophy || "");
          setMission(data.content.mission || "");
          setVision(data.content.vision || "");
          setObjectives(
            data.content.objectives?.length ? data.content.objectives : [""],
          );
          setUniqueFeatures(
            data.content.uniqueFeatures?.length
              ? data.content.uniqueFeatures
              : [""],
          );
          setEmployability(
            Array.isArray(data.content.employability)
              ? data.content.employability
              : data.content.employability
                ? [data.content.employability]
                : [""],
          );
          setUtmeRequirements(data.content.utmeRequirements || "");
          setDirectEntryRequirements(
            data.content.directEntryRequirements || "",
          );
          setTransferRequirements(data.content.transferRequirements || "");
          setMinimumDuration(data.content.minimumDuration || "");
          setGraduationRequirements(data.content.graduationRequirements || "");
          setMinimumCGPA(data.content.minimumCGPA || 2.5);
          setTotalUnits(data.content.totalUnits || 154);
          setRegulations(data.content.sectionF?.content || "");
          setSummaryOfChanges(data.content.sectionG?.content || "");
          // Restore persisted GRACE result
          if (data.content.philosophyGrace) {
            setGracePhilosophyResult(data.content.philosophyGrace);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch submission:", err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSubmission();
  }, [fetchSubmission]);

  // Word count helper
  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  // Google Drive auto-converter
  const processImageUrl = (url: string) => {
    const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`;
    }
    return url;
  };

  const philosophyWordCount = getWordCount(philosophy);
  const isPhilosophyValid =
    philosophyWordCount >= 150 && philosophyWordCount <= 250;

  // Auto-save effect - debounced save after 3 seconds of no changes
  useEffect(() => {
    // Only auto-save if there are changes, user can edit, and submission exists
    if (!hasChanges || !canEdit || !submission) return;

    // Clear any existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set a new timeout to save after 3 seconds
    autoSaveTimeoutRef.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        const contentToSave = {
          programmeInfo: {
            ...submission.content?.programmeInfo,
            deanImageUrl,
            hodImageUrl,
          },
          philosophy,
          philosophyGracePass: gracePhilosophyResult?.passed || false,
          philosophyGrace: gracePhilosophyResult || null,
          mission,
          vision,
          objectives: objectives.filter((o) => o.trim()),
          uniqueFeatures: uniqueFeatures.filter((f) => f.trim()),
          employability,
          utmeRequirements,
          directEntryRequirements,
          transferRequirements,
          minimumDuration,
          graduationRequirements,
          minimumCGPA,
          totalUnits,
          sectionF: { content: regulations },
          sectionG: { content: summaryOfChanges },
        };

        const response = await fetch(`/api/submissions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: contentToSave }),
        });

        if (response.ok) {
          setHasChanges(false);
          setAutoSaveStatus("saved");
          setLastSavedAt(new Date());
        } else {
          setAutoSaveStatus("error");
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
        setAutoSaveStatus("error");
      }
    }, 3000); // 3 second debounce

    // Cleanup timeout on unmount or when dependencies change
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    hasChanges,
    canEdit,
    submission,
    philosophy,
    mission,
    vision,
    objectives,
    uniqueFeatures,
    employability,
    utmeRequirements,
    directEntryRequirements,
    transferRequirements,
    minimumDuration,
    graduationRequirements,
    minimumCGPA,
    totalUnits,
    regulations,
    summaryOfChanges,
    gracePhilosophyResult,
    deanImageUrl,
    hodImageUrl,
    id,
  ]);

  const handleSave = async () => {
    if (!submission) return;
    setIsSaving(true);

    try {
      const contentToSave = {
        programmeInfo: {
          ...submission.content?.programmeInfo,
          deanImageUrl,
          hodImageUrl,
        },
        philosophy,
        philosophyGracePass: gracePhilosophyResult?.passed || false,
        philosophyGrace: gracePhilosophyResult || null,
        mission,
        vision,
        objectives: objectives.filter((o) => o.trim()),
        uniqueFeatures: uniqueFeatures.filter((f) => f.trim()),
        employability,
        utmeRequirements,
        directEntryRequirements,
        transferRequirements,
        minimumDuration,
        graduationRequirements,
        minimumCGPA,
        totalUnits,
        sectionF: { content: regulations },
        sectionG: { content: summaryOfChanges },
      };

      const response = await fetch(`/api/submissions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToSave }),
      });

      if (response.ok) {
        setHasChanges(false);
        toast.success("Draft saved successfully");
        fetchSubmission();
      } else {
        toast.error("Failed to save draft");
      }
    } catch (err) {
      console.error("Failed to save:", err);
      toast.error("Failed to save draft");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransition = async (action: string) => {
    if (!submission || !currentUser) return;

    // Validate before submission
    if (action === "SUBMIT") {
      const errors: string[] = [];
      if (!isPhilosophyValid) {
        errors.push("Philosophy must be 150-250 words");
      }
      if (!minimumDuration) {
        errors.push("Programme duration must be selected (4-6 years)");
      }
      // GRACE compliance checks
      if (!gracePhilosophyResult?.passed) {
        errors.push("Programme philosophy must pass GRACE compliance check");
      }
      // Check course description GRACE compliance
      try {
        const coursesRes = await fetch(
          `/api/courses?submissionId=${submission.id}`,
        );
        if (coursesRes.ok) {
          const courses = await coursesRes.json();
          const failedCourses = courses.filter(
            (c: {
              description?: { gracePass?: boolean; courseContent?: string };
              code: string;
            }) => c.description?.courseContent && !c.description?.gracePass,
          );
          if (failedCourses.length > 0) {
            const codes = failedCourses
              .map((c: { code: string }) => c.code)
              .join(", ");
            errors.push(`Course descriptions not GRACE compliant: ${codes}`);
          }
          const missingDesc = courses.filter(
            (c: { description?: { courseContent?: string } }) =>
              !c.description?.courseContent,
          );
          if (missingDesc.length > 0) {
            const codes = missingDesc
              .map((c: { code: string }) => c.code)
              .join(", ");
            errors.push(`Course descriptions missing: ${codes}`);
          }
        }
      } catch {
        errors.push("Could not verify course GRACE compliance");
      }
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
      }
      if (errors.length > 0) {
        alert("Cannot submit:\n" + errors.join("\n"));
        return;
      }
    }

    const remarks =
      action === "REJECT"
        ? prompt("Please provide a reason for rejection:")
        : action === "RETURN"
          ? prompt("Please provide feedback for the changes needed:")
          : null;

    if ((action === "REJECT" || action === "RETURN") && !remarks) return;

    try {
      const response = await fetch(`/api/submissions/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          performedById: currentUser.id,
          remarks,
        }),
      });

      if (response.ok) {
        const messages: Record<string, string> = {
          SUBMIT: "Submission sent for review",
          APPROVE: "Submission approved",
          REJECT: "Submission rejected",
          RETURN: "Changes requested",
        };
        toast.success(messages[action] || "Action completed");
        fetchSubmission();
      } else {
        toast.error("Failed to complete action");
      }
    } catch (err) {
      console.error("Failed to transition:", err);
      toast.error("Failed to complete action");
    }
  };

  const parseGraceAnalysis = (analysis: any) => {
    let scores: Record<string, number> = {};
    let explanation = "";
    let recommendation = "";

    // If it's a string, it might be raw JSON string or markdown
    if (typeof analysis === "string") {
      try {
        // Try parsing it directly as JSON first
        analysis = JSON.parse(analysis);
      } catch {
        // Fallback: If it's markdown, extract the ```json part
        const jsonMatch = analysis.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) {
          try {
            analysis = JSON.parse(jsonMatch[1]);
          } catch {
            // Leave analysis as string to fall back to regex
          }
        }
      }
    }

    if (typeof analysis === "object" && analysis !== null) {
      if (Array.isArray(analysis.GRACE_PILLARS)) {
        analysis.GRACE_PILLARS.forEach((p: any) => {
          if (p && p.pillar && typeof p.score === "number") {
            scores[p.pillar] = p.score;
          }
        });
      } else if (typeof analysis.GRACE_PILLARS === "object") {
        scores = analysis.GRACE_PILLARS || {};
      }

      explanation = analysis.Vision_Alignment || analysis.Explanation || "";
      recommendation = analysis.Recommendation || "";
    } else if (typeof analysis === "string") {
      const explanationMatch = analysis.match(
        /\*\*Explanation:\*\*\s*([\s\S]*?)(?=\*\*(?:Vision Alignment|Recommendation))/,
      );
      explanation = explanationMatch ? explanationMatch[1].trim() : "";

      const recommendationMatch = analysis.match(
        /\*\*Recommendation:\*\*\s*([\s\S]*?)$/,
      );
      recommendation = recommendationMatch ? recommendationMatch[1].trim() : "";
    }

    const scoreValues = Object.values(scores);
    const passed = scoreValues.length > 0 && scoreValues.every((s) => s >= 3);

    return { scores, explanation, recommendation, passed };
  };

  const checkPhilosophyGrace = async () => {
    if (!philosophy.trim() || !submission) return;

    setGraceCheckingPhilosophy(true);
    setGracePhilosophyResult(null);

    try {
      const res = await fetch("https://santacl-grace.hf.space/check-grace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `${submission.programme.name} - Programme Philosophy`,
          content: philosophy,
        }),
      });

      if (!res.ok) {
        setGracePhilosophyResult({
          scores: {},
          explanation: "Compliance check failed. Please try again.",
          recommendation: "",
          passed: false,
        });
      } else {
        const data = await res.json();

        const analysisData = data.analysis || data;
        if (analysisData) {
          setGracePhilosophyResult(parseGraceAnalysis(analysisData));
        } else {
          setGracePhilosophyResult({
            scores: {},
            explanation: "No analysis returned from server.",
            recommendation: "",
            passed: false,
          });
        }
      }
    } catch {
      setGracePhilosophyResult({
        scores: {},
        explanation:
          "Could not reach the GRACE compliance server. Please try again later.",
        recommendation: "",
        passed: false,
      });
    } finally {
      setGraceCheckingPhilosophy(false);
      setHasChanges(true);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !currentUser) return;
    setIsAddingComment(true);

    try {
      const response = await fetch(`/api/submissions/${id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newComment,
          section: activeSection,
          type: commentType,
          authorId: currentUser.id,
        }),
      });

      if (response.ok) {
        setNewComment("");
        fetchSubmission();
      }
    } catch (err) {
      console.error("Failed to add comment:", err);
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleResolveComment = async (
    commentId: string,
    currentStatus: string,
  ) => {
    try {
      const response = await fetch(
        `/api/submissions/${id}/comments/${commentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: currentStatus === "OPEN" ? "RESOLVED" : "OPEN",
          }),
        },
      );

      if (response.ok) {
        fetchSubmission();
      }
    } catch (err) {
      console.error("Failed to update comment:", err);
    }
  };

  const addListItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter((prev) => [...prev, ""]);
    setHasChanges(true);
  };

  const updateListItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    value: string,
  ) => {
    setter((prev) => {
      const newItems = [...prev];
      newItems[index] = value;
      return newItems;
    });
    setHasChanges(true);
  };

  const removeListItem = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Submission Not Found</CardTitle>
            <CardDescription>
              The requested submission could not be found.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const sectionComments = submission.comments.filter(
    (c) => c.section === activeSection,
  );

  const currentSection = sections.find((s) => s.key === activeSection);
  const SectionIcon = currentSection?.icon || FileText;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href="/submissions">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {submission.title}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-muted-foreground">
              <span>{submission.programme.name}</span>
              <span>•</span>
              <span>{submission.programme.department.school.code}</span>
              <span>•</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={submission.status === "APPROVED" ? "default" : "secondary"}
            className={submission.status === "APPROVED" ? "bg-green-500" : ""}
          >
            {submission.status}
          </Badge>
          <Badge variant="outline">
            Phase {submission.currentPhase}:{" "}
            {phaseNames[submission.currentPhase]}
          </Badge>
        </div>
      </div>

      {/* Action Bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Draft
                </Button>
              )}
              {/* Auto-save status indicator */}
              {canEdit && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {autoSaveStatus === "saving" && (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Saving...</span>
                    </>
                  )}
                  {autoSaveStatus === "saved" && (
                    <>
                      <Cloud className="h-3 w-3 text-green-600" />
                      <span className="text-green-600">
                        All changes saved
                        {lastSavedAt && (
                          <span className="ml-1 text-muted-foreground">
                            ({lastSavedAt.toLocaleTimeString()})
                          </span>
                        )}
                      </span>
                    </>
                  )}
                  {autoSaveStatus === "error" && (
                    <>
                      <CloudOff className="h-3 w-3 text-red-600" />
                      <span className="text-red-600">Save failed</span>
                    </>
                  )}
                  {autoSaveStatus === "idle" && hasChanges && (
                    <span className="text-amber-600">Unsaved changes</span>
                  )}
                </div>
              )}
              {canSubmit && (
                <Button
                  variant="default"
                  onClick={() => handleTransition("SUBMIT")}
                >
                  <Send className="mr-2 h-4 w-4" />
                  Submit for Review
                </Button>
              )}
              {/* Preview button - available to all viewers */}
              <BulletinPreview
                submission={
                  submission as Parameters<
                    typeof BulletinPreview
                  >[0]["submission"]
                }
                departmentId={submission.programme.department.id}
              />
            </div>
            <div className="flex items-center gap-2">
              {canReview && submission.status === "IN_REVIEW" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleTransition("RETURN")}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Request Changes
                  </Button>
                  {canApprove && (
                    <>
                      <Button
                        variant="destructive"
                        onClick={() => handleTransition("REJECT")}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => handleTransition("APPROVE")}
                      >
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Approve
                      </Button>
                    </>
                  )}
                </>
              )}

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="ml-2 bg-muted/50">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Comments ({submission.comments.length})
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-[400px] sm:w-[540px] overflow-y-auto p-6 sm:p-8"
                >
                  <SheetHeader className="mb-4">
                    <SheetTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Comments
                      <Badge variant="secondary" className="ml-2">
                        {currentSection?.title.split(" ")[0]}
                      </Badge>
                    </SheetTitle>
                  </SheetHeader>

                  <div className="space-y-4">
                    {/* Validation Errors */}
                    {validationErrors.length > 0 && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          {validationErrors.map((error, i) => (
                            <div key={i}>{error}</div>
                          ))}
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Add Comment Form */}
                    {canComment && (
                      <div className="space-y-3 pb-4 border-b">
                        <Textarea
                          placeholder="Add a comment..."
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          rows={3}
                        />
                        <div className="flex items-center gap-2">
                          <Select
                            value={commentType}
                            onValueChange={setCommentType}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SUGGESTION">
                                Suggestion
                              </SelectItem>
                              <SelectItem value="ISSUE">Issue</SelectItem>
                              <SelectItem value="QUESTION">Question</SelectItem>
                              <SelectItem value="APPROVAL">Approval</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            onClick={handleAddComment}
                            disabled={!newComment.trim() || isAddingComment}
                          >
                            {isAddingComment ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Plus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Comments List */}
                    <div className="space-y-3">
                      {sectionComments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          No comments for this section
                        </div>
                      ) : (
                        sectionComments.map((comment) => (
                          <div
                            key={comment.id}
                            className={`p-3 rounded-lg border ${
                              comment.status === "RESOLVED" ? "opacity-50" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">
                                  {comment.author.firstName}{" "}
                                  {comment.author.lastName}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className={`text-xs ${
                                    commentTypeColors[comment.type]
                                  }`}
                                >
                                  {comment.type}
                                </Badge>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() =>
                                  handleResolveComment(
                                    comment.id,
                                    comment.status,
                                  )
                                }
                              >
                                {comment.status === "OPEN"
                                  ? "Resolve"
                                  : "Reopen"}
                              </Button>
                            </div>
                            <p className="text-sm mt-1">{comment.content}</p>
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(comment.createdAt).toLocaleDateString()}
                              <span>• Phase {comment.phase}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="w-full">
        {/* Editor Panel */}
        <div className="w-full">
          <Card>
            <CardHeader className="pb-3">
              <Tabs value={activeSection} onValueChange={setActiveSection}>
                <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1">
                  {sections.map((section) => {
                    const Icon = section.icon;
                    return (
                      <TabsTrigger
                        key={section.key}
                        value={section.key}
                        className="flex items-center gap-1"
                      >
                        <Icon className="h-4 w-4" />
                        <span className="hidden xl:inline text-xs">
                          {section.title}
                        </span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold flex items-center gap-2">
                    <SectionIcon className="h-5 w-5" />
                    {currentSection?.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {currentSection?.description}
                  </p>
                </div>
                <Separator />

                {/* Deans & HODs Section */}
                {activeSection === "deans_hods" && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                       <Label>Dean Image URL</Label>
                       <p className="text-xs text-muted-foreground">Provide a direct external URL to the Dean&apos;s picture.</p>
                       {canEdit ? (
                          <Input value={deanImageUrl} onChange={(e) => { setDeanImageUrl(processImageUrl(e.target.value)); setHasChanges(true); }} placeholder="https://example.com/dean.jpg or Google Drive link" />
                       ) : (
                          <p className="text-sm bg-muted p-3 rounded-md">{deanImageUrl || "Not provided"}</p>
                       )}
                       {deanImageUrl && (
                         /* eslint-disable-next-line @next/next/no-img-element */
                         <img src={deanImageUrl} alt="Dean" className="mt-2 h-32 object-contain rounded-md" />
                       )}
                    </div>
                    <div className="space-y-2">
                       <Label>HOD Image URL</Label>
                       <p className="text-xs text-muted-foreground">Provide a direct external URL to the HOD&apos;s picture.</p>
                       {canEdit ? (
                          <Input value={hodImageUrl} onChange={(e) => { setHodImageUrl(processImageUrl(e.target.value)); setHasChanges(true); }} placeholder="https://example.com/hod.jpg or Google Drive link" />
                       ) : (
                          <p className="text-sm bg-muted p-3 rounded-md">{hodImageUrl || "Not provided"}</p>
                       )}
                       {hodImageUrl && (
                         /* eslint-disable-next-line @next/next/no-img-element */
                         <img src={hodImageUrl} alt="HOD" className="mt-2 h-32 object-contain rounded-md" />
                       )}
                    </div>
                  </div>
                )}

                {/* Staff Directory Section */}
                {activeSection === "staff" && (
                  <StaffTable
                    departmentId={submission.programme.department.id}
                    disabled={!canEdit}
                  />
                )}

                {/* Programme Overview Section */}
                {activeSection === "overview" && (
                  <div className="space-y-6">
                    {/* Philosophy */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Programme Philosophy *</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Ensure this philosophy statement is{" "}
                            <strong>GRACE compliant</strong> as proposed by the
                            Vice Chancellor.
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={checkPhilosophyGrace}
                              disabled={
                                graceCheckingPhilosophy || !philosophy.trim()
                              }
                            >
                              {graceCheckingPhilosophy ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <ShieldCheck className="h-4 w-4 mr-1" />
                              )}
                              Check GRACE
                            </Button>
                          )}
                          <span
                            className={`text-xs ${
                              isPhilosophyValid
                                ? "text-green-600"
                                : philosophyWordCount > 0
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {philosophyWordCount}/150-250 words
                          </span>
                        </div>
                      </div>
                      {canEdit ? (
                        <Textarea
                          value={philosophy}
                          onChange={(e) => {
                            setPhilosophy(e.target.value);
                            setHasChanges(true);
                            if (gracePhilosophyResult) {
                              setGracePhilosophyResult(null);
                            }
                          }}
                          placeholder="The philosophy of this programme is to provide broad and high quality education... (GRACE compliant: clear, outcome-focused, and aligned with institutional goals)"
                          rows={4}
                          className={
                            !isPhilosophyValid && philosophyWordCount > 0
                              ? "border-red-500"
                              : ""
                          }
                        />
                      ) : (
                        <p className="text-sm bg-muted p-3 rounded-md">
                          {philosophy || "Not provided"}
                        </p>
                      )}

                      {/* GRACE Compliance Feedback */}
                      {gracePhilosophyResult && (
                        <GraceResultPanel result={gracePhilosophyResult} />
                      )}
                    </div>

                    {/* Mission */}
                    <div className="space-y-2">
                      <Label>Programme Mission</Label>
                      <p className="text-xs text-muted-foreground">
                        A concise statement defining the programme&apos;s
                        purpose and core commitment.
                      </p>
                      {canEdit ? (
                        <Textarea
                          value={mission}
                          onChange={(e) => {
                            setMission(e.target.value);
                            setHasChanges(true);
                          }}
                          placeholder="e.g., Our mission is to produce graduates who are competent, ethical, and innovative..."
                          rows={3}
                        />
                      ) : (
                        <p className="text-sm bg-muted p-3 rounded-md">
                          {mission || "Not provided"}
                        </p>
                      )}
                    </div>

                    {/* Vision */}
                    <div className="space-y-2">
                      <Label>Programme Vision</Label>
                      <p className="text-xs text-muted-foreground">
                        A forward-looking statement describing the
                        programme&apos;s aspirations.
                      </p>
                      {canEdit ? (
                        <Textarea
                          value={vision}
                          onChange={(e) => {
                            setVision(e.target.value);
                            setHasChanges(true);
                          }}
                          placeholder="e.g., To be a leading programme recognized for excellence in teaching, research, and community impact..."
                          rows={3}
                        />
                      ) : (
                        <p className="text-sm bg-muted p-3 rounded-md">
                          {vision || "Not provided"}
                        </p>
                      )}
                    </div>

                    {/* Objectives */}
                    <div className="space-y-2">
                      <Label>Programme Objectives *</Label>
                      <p className="text-xs text-muted-foreground">
                        The specific objectives are to:
                      </p>
                      {objectives.map((obj, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <span className="mt-2 text-sm text-muted-foreground w-6">
                            {index + 1}.
                          </span>
                          {canEdit ? (
                            <>
                              <Input
                                value={obj}
                                onChange={(e) =>
                                  updateListItem(
                                    setObjectives,
                                    index,
                                    e.target.value,
                                  )
                                }
                                placeholder="Enter objective..."
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  removeListItem(setObjectives, index)
                                }
                                disabled={objectives.length <= 1}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <p className="text-sm">{obj}</p>
                          )}
                        </div>
                      ))}
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addListItem(setObjectives)}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add Objective
                        </Button>
                      )}
                    </div>

                    {/* Unique Features */}
                    <div className="space-y-2">
                      <Label>Unique Features</Label>
                      {uniqueFeatures.map((feature, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <span className="mt-2 text-sm text-muted-foreground w-6">
                            {index + 1}.
                          </span>
                          {canEdit ? (
                            <>
                              <Input
                                value={feature}
                                onChange={(e) =>
                                  updateListItem(
                                    setUniqueFeatures,
                                    index,
                                    e.target.value,
                                  )
                                }
                                placeholder="Enter unique feature..."
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  removeListItem(setUniqueFeatures, index)
                                }
                                disabled={uniqueFeatures.length <= 1}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <p className="text-sm">{feature}</p>
                          )}
                        </div>
                      ))}
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addListItem(setUniqueFeatures)}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add Feature
                        </Button>
                      )}
                    </div>

                    {/* Employability */}
                    <div className="space-y-2">
                      <Label>Employability Skills</Label>
                      {employability.map((skill, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <span className="mt-2 text-sm text-muted-foreground w-6">
                            {index + 1}.
                          </span>
                          {canEdit ? (
                            <>
                              <Input
                                value={skill}
                                onChange={(e) =>
                                  updateListItem(
                                    setEmployability,
                                    index,
                                    e.target.value,
                                  )
                                }
                                placeholder="Enter employability skill..."
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  removeListItem(setEmployability, index)
                                }
                                disabled={employability.length <= 1}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <p className="text-sm">{skill}</p>
                          )}
                        </div>
                      ))}
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addListItem(setEmployability)}
                        >
                          <Plus className="h-4 w-4 mr-1" /> Add Skill
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {/* Admission Requirements Section */}
                {activeSection === "admission" && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>UTME Requirements *</Label>
                      {canEdit ? (
                        <Textarea
                          value={utmeRequirements}
                          onChange={(e) => {
                            setUtmeRequirements(e.target.value);
                            setHasChanges(true);
                          }}
                          placeholder="In addition to appropriate UTME score, a candidate must possess..."
                          rows={3}
                        />
                      ) : (
                        <p className="text-sm bg-muted p-3 rounded-md">
                          {utmeRequirements || "Not provided"}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Direct Entry Requirements</Label>
                      {canEdit ? (
                        <Textarea
                          value={directEntryRequirements}
                          onChange={(e) => {
                            setDirectEntryRequirements(e.target.value);
                            setHasChanges(true);
                          }}
                          placeholder="A minimum of a credit at the University/National Diploma..."
                          rows={3}
                        />
                      ) : (
                        <p className="text-sm bg-muted p-3 rounded-md">
                          {directEntryRequirements || "Not provided"}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Inter-University Transfer Mode</Label>
                      {canEdit ? (
                        <Textarea
                          value={transferRequirements}
                          onChange={(e) => {
                            setTransferRequirements(e.target.value);
                            setHasChanges(true);
                          }}
                          placeholder="Students can transfer into 200-Level courses provided..."
                          rows={2}
                        />
                      ) : (
                        <p className="text-sm bg-muted p-3 rounded-md">
                          {transferRequirements || "Not provided"}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Programme Duration *</Label>
                      <p className="text-xs text-muted-foreground">
                        Select the minimum programme duration (4-6 years as per
                        NUC guidelines).
                      </p>
                      {canEdit ? (
                        <Select
                          value={minimumDuration}
                          onValueChange={(value) => {
                            setMinimumDuration(value);
                            setHasChanges(true);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select programme duration" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="4 years">
                              4 Years (Minimum)
                            </SelectItem>
                            <SelectItem value="5 years">5 Years</SelectItem>
                            <SelectItem value="6 years">
                              6 Years (Maximum)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm bg-muted p-3 rounded-md">
                          {minimumDuration || "Not provided"}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Graduation Requirements Section */}
                {activeSection === "graduation" && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>Graduation Requirements *</Label>
                      {canEdit ? (
                        <Textarea
                          value={graduationRequirements}
                          onChange={(e) => {
                            setGraduationRequirements(e.target.value);
                            setHasChanges(true);
                          }}
                          placeholder="To be eligible for the award of the Bachelor degree, a student must have..."
                          rows={4}
                        />
                      ) : (
                        <p className="text-sm bg-muted p-3 rounded-md">
                          {graduationRequirements || "Not provided"}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Minimum CGPA *</Label>
                        {canEdit ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="1"
                            max="5"
                            value={minimumCGPA}
                            onChange={(e) => {
                              setMinimumCGPA(parseFloat(e.target.value) || 2.5);
                              setHasChanges(true);
                            }}
                          />
                        ) : (
                          <p className="text-sm bg-muted p-3 rounded-md">
                            {minimumCGPA}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Total Credit Units *</Label>
                        {canEdit ? (
                          <Input
                            type="number"
                            min="100"
                            max="250"
                            value={totalUnits}
                            onChange={(e) => {
                              setTotalUnits(parseInt(e.target.value) || 154);
                              setHasChanges(true);
                            }}
                          />
                        ) : (
                          <p className="text-sm bg-muted p-3 rounded-md">
                            {totalUnits}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Course Structure Section */}
                {activeSection === "courses" && (
                  <CourseTable
                    submissionId={submission.id}
                    departmentId={submission.programme.department.id}
                    disabled={!canEdit}
                    onValidationChange={(isValid, errors) => {
                      if (!isValid) {
                        setValidationErrors(errors);
                      } else {
                        setValidationErrors([]);
                      }
                    }}
                  />
                )}

                {/* Course Descriptions Section */}
                {activeSection === "descriptions" && (
                  <CourseDescriptionForm
                    submissionId={submission.id}
                    disabled={!canEdit}
                  />
                )}

                {/* Regulations & Changes Section */}
                {activeSection === "regulations" && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label>Programme Regulations</Label>
                      {canEdit ? (
                        <RichTextEditor
                          content={regulations}
                          onChange={(content) => {
                            setRegulations(content);
                            setHasChanges(true);
                          }}
                          placeholder="Assessment methods, probation rules, internship requirements..."
                        />
                      ) : (
                        <RichTextViewer content={regulations} />
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Summary of Changes</Label>
                      <p className="text-xs text-muted-foreground">
                        Document any changes from the previous bulletin
                      </p>
                      {canEdit ? (
                        <RichTextEditor
                          content={summaryOfChanges}
                          onChange={(content) => {
                            setSummaryOfChanges(content);
                            setHasChanges(true);
                          }}
                          placeholder="List changes to structure, new/deleted courses, policy changes..."
                        />
                      ) : (
                        <RichTextViewer content={summaryOfChanges} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
