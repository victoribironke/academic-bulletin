"use client";

import { useState, useEffect, use, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Undo2,
  MessageSquare,
  Clock,
  Loader2,
  Plus,
  AlertCircle,
  Archive,
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
  Camera,
  Trash2,
} from "lucide-react";
import {
  RECALL_LABEL,
  REQUEST_REVISION_LABEL,
  TOTAL_PHASES,
  approveActionLabel,
  phaseHeading,
} from "@/lib/submissions/phases";
import type { SubmissionWorkflow } from "@/lib/submissions/phase-owners";
import { PageHeader } from "@/components/shared/page-header";
import { formatDate, formatTime } from "@/lib/dates/format";
import { StatusBadge } from "@/components/shared/status-badge";
import { PhaseTracker } from "@/components/shared/phase-tracker";
import { EmptyState } from "@/components/shared/states";
import { cn } from "@/lib/utils";
import {
  GRACE_OVERRIDE_REASON_LENGTH,
  GRACE_SUBMISSION_REQUIRED,
} from "@/lib/grace-config";
import { MINIMUM_CGPA_RANGE, UNIVERSITY_MINIMUM_CGPA } from "@/lib/submissions/cgpa-rule";
import { Checkbox } from "@/components/ui/checkbox";
import { PhotoUploadGuidance } from "@/components/shared/photo-upload-guidance";
import { useConfirmDelete } from "@/components/shared/typed-delete-dialog";
import { ProgrammeCountdown } from "@/components/calendar/countdown";

interface Submission {
  id: string;
  title: string;

  currentPhase: number;
  status:
    | "DRAFT"
    | "CORRECTIONS_REQUIRED"
    | "IN_REVIEW"
    | "APPROVED"
    | "REJECTED";
  submittedAt: string | null;
  approvedAt: string | null;
  programme: {
    id: string;
    name: string;
    code: string;
    duration?: number;
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
    programmeInfo?: { deanImageUrl?: string; hodImageUrl?: string };
    philosophy?: string;
    philosophyGracePass?: boolean;
    philosophyGrace?: {
      scores: Record<string, number>;
      pillarSummaries?: Record<string, string>;
      explanation: string;
      recommendation: string;
      passed: boolean;
      suggestedContent?: string;
    } | null;
    mission?: string;
    vision?: string;
    objectives?: string[];
    uniqueFeatures?: string[];
    employability?: string | string[];
    centurySkills?: string[];
    utmeRequirements?: string;
    directEntryRequirements?: string;
    transferRequirements?: string;
    minimumDuration?: string;
    graduationRequirements?: string;
    minimumCGPA?: number;
    totalUnits?: number;
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
  /** What the signed-in person may do now, worked out by the server. */
  workflow?: SubmissionWorkflow & { canEdit: boolean };
  /** Task A2: set when the draft's cycle is in the Archive. */
  cycle?: { name: string; isTest: boolean; archivedAt: string | null } | null;
  /** D5: when the Dean first opened it at School Board Harmonisation. */
  openedByDeanAt?: string | null;
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
  /** D4: set when someone acted on a phase they do not own. */
  phaseOverride?: { reason: string; role: string } | null;
  performedBy: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

type ImageVerificationFeedback = {
  role: "dean" | "hod";
  status: "success" | "error";
  message: string;
};

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
      className={`rounded-lg border p-4 space-y-3 ${result.passed
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
          className={`text-sm font-medium ${result.passed ? "text-green-700" : "text-amber-700"
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

      {!result.passed && result.suggestedContent?.trim() && (
        <div className="space-y-3 border-t border-amber-200 pt-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Suggested corrected version
            </p>
            <p className="text-xs text-muted-foreground">
              Review this wording before applying it to the bulletin.
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
  // T1: "?section=courses" opens the draft on that section (links from My desk).
  const searchParams = useSearchParams();
  const requestedSection = searchParams.get("section");
  const firstSection =
    requestedSection && sections.some((section) => section.key === requestedSection)
      ? requestedSection
      : "deans_hods";
  const [activeSection, setActiveSectionState] = useState(firstSection);
  // Sections opened so far; their editors stay mounted once visited.
  const [visitedSections, setVisitedSections] = useState<Set<string>>(
    () => new Set([firstSection]),
  );
  const setActiveSection = (key: string) => {
    setActiveSectionState(key);
    setVisitedSections((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  };

  // These sections have their own Save button inside the section.
  const sectionSavesSeparately = ["staff", "courses", "descriptions"].includes(activeSection);
  const [hasChanges, setHasChanges] = useState(false);
  // Q7: one DELETE box for removing photos and written items on this page.
  const { confirmDelete, dialog: deleteDialog } = useConfirmDelete();
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
  const [minimumCGPA, setMinimumCGPA] = useState<number>(UNIVERSITY_MINIMUM_CGPA);
  const [totalUnits, setTotalUnits] = useState<number>(154);
  const [regulations, setRegulations] = useState("");
  const [summaryOfChanges, setSummaryOfChanges] = useState("");

  // GRACE compliance check state
  const [graceCheckingPhilosophy, setGraceCheckingPhilosophy] = useState(false);
  const [gracePhilosophyResult, setGracePhilosophyResult] = useState<{
    scores: Record<string, number>;
    pillarSummaries?: Record<string, string>;
    explanation: string;
    recommendation: string;
    passed: boolean;
    suggestedContent?: string;
  } | null>(null);
  const [gracePhilosophyError, setGracePhilosophyError] = useState<string | null>(
    null,
  );

  // Review decision dialog (approve / send back) and submit blockers dialog
  const [reviewAction, setReviewAction] = useState<
    "APPROVE" | "REJECT" | "RETURN" | null
  >(null);
  const [reviewRemarks, setReviewRemarks] = useState("");
  // Evidence some phases need to close, e.g. the Senate minute reference
  const [reviewReference, setReviewReference] = useState("");
  // Approving past GRACE results that haven't passed (allowed roles only)
  const [graceOverrideOn, setGraceOverrideOn] = useState(false);
  const [graceOverrideReason, setGraceOverrideReason] = useState("");
  // D4: acting on a phase you don't own needs a written reason.
  const [phaseOverrideReason, setPhaseOverrideReason] = useState("");
  const [submitOverrideOpen, setSubmitOverrideOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [submitBlockers, setSubmitBlockers] = useState<string[] | null>(null);

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
  const deanFileRef = useRef<HTMLInputElement>(null);
  const hodFileRef = useRef<HTMLInputElement>(null);
  const [uploadingDean, setUploadingDean] = useState(false);
  const [uploadingHod, setUploadingHod] = useState(false);
  const [imageVerificationFeedback, setImageVerificationFeedback] =
    useState<ImageVerificationFeedback | null>(null);

  const isAssignedSubmission =
    !currentUser ||
    (currentUser.role === "HOD" &&
      submission?.programme.department.id === currentUser.departmentId) ||
    (currentUser.role === "PROGRAMME_COORDINATOR" &&
      !!submission?.programme.id &&
      currentUser.programmeIds.includes(submission.programme.id)) ||
    !["HOD", "PROGRAMME_COORDINATOR"].includes(currentUser.role);

  const submissionsBackHref = "/submissions";

  // The server decides from the phase owners, the person's unit (or their
  // read-only browsing) and who cleared the last gate.
  const workflowActions = submission?.workflow?.actions ?? [];
  const requiredEvidence = submission?.workflow?.requiredEvidence ?? null;
  // GRACE results that stop Approve, and whether this person may override them
  const graceGate = submission?.workflow?.graceGate ?? null;
  const approvingWithOverride = Boolean(graceGate?.canOverride && graceOverrideOn);
  const graceOverrideReasonOk =
    graceOverrideReason.trim().length >= GRACE_OVERRIDE_REASON_LENGTH.min &&
    graceOverrideReason.trim().length <= GRACE_OVERRIDE_REASON_LENGTH.max;
  const approvalStoppedByGrace =
    Boolean(graceGate?.blocked) && !(approvingWithOverride && graceOverrideReasonOk);
  const canEdit = Boolean(currentUser && submission?.workflow?.canEdit);
  const canComment =
    (hasPermission("comment:submission") || hasPermission("review:submission")) &&
    isAssignedSubmission;
  const canSubmit = workflowActions.includes("SUBMIT");
  const phaseOverride = submission?.workflow?.override ?? null;
  const phaseOverrideReasonOk =
    !phaseOverride || phaseOverrideReason.trim().length >= phaseOverride.minLength;
  // F0: Submit stays off, with the reason shown, until submissions open.
  const submitClosed = submission?.workflow?.submitClosed ?? null;
  const canApprove = workflowActions.includes("APPROVE");
  const canReturn = workflowActions.includes("RETURN");
  const canReject = workflowActions.includes("REJECT");
  // D5: the department can take it back until the Dean opens it.
  const canRecall = workflowActions.includes("RECALL");
  const submitActionLabel =
    submission?.currentPhase === 1
      ? "Submit to School"
      : submission?.currentPhase === 2
        ? "Resubmit to DAP Vetting"
        : "Resubmit revision";
  // Q6: buttons say what they do.
  const returnActionLabel =
    submission?.currentPhase === 2
      ? "Return to Departmental Drafting"
      : submission?.currentPhase === 3
        ? "Return to School Board"
        : "Return to the previous phase";

  // Puts freshly loaded submission data (or a local unsaved draft) into the form.
  const applySubmissionData = useCallback((data: Submission) => {
    setSubmission(data);

    // Try restoring from localStorage draft first (crash recovery)
    let draft: Record<string, any> | null = null;
    try {
      const raw = localStorage.getItem(`submission-draft-${id}`);
      if (raw) draft = JSON.parse(raw);
    } catch { /* corrupt data – ignore */ }

    const src = draft || data.content || {};

    setDeanImageUrl(src.programmeInfo?.deanImageUrl || data.content?.programmeInfo?.deanImageUrl || "");
    setHodImageUrl(src.programmeInfo?.hodImageUrl || data.content?.programmeInfo?.hodImageUrl || "");
    setPhilosophy(src.philosophy ?? data.content?.philosophy ?? "");
    setMission(src.mission ?? data.content?.mission ?? "");
    setVision(src.vision ?? data.content?.vision ?? "");
    setObjectives(
      (src.objectives?.length ? src.objectives : null) ??
      (data.content?.objectives?.length ? data.content.objectives : [""])
    );
    setUniqueFeatures(
      (src.uniqueFeatures?.length ? src.uniqueFeatures : null) ??
      (data.content?.uniqueFeatures?.length ? data.content.uniqueFeatures : [""])
    );
    setEmployability(
      Array.isArray(src.employability) ? src.employability :
        Array.isArray(data.content?.employability) ? data.content.employability :
          data.content?.employability ? [data.content.employability] : [""]
    );
    setUtmeRequirements(src.utmeRequirements ?? data.content?.utmeRequirements ?? "");
    setDirectEntryRequirements(src.directEntryRequirements ?? data.content?.directEntryRequirements ?? "");
    setTransferRequirements(src.transferRequirements ?? data.content?.transferRequirements ?? "");
    setMinimumDuration(src.minimumDuration ?? data.content?.minimumDuration ?? "");
    setGraduationRequirements(src.graduationRequirements ?? data.content?.graduationRequirements ?? "");
    setMinimumCGPA(src.minimumCGPA ?? data.content?.minimumCGPA ?? UNIVERSITY_MINIMUM_CGPA);
    setTotalUnits(src.totalUnits ?? data.content?.totalUnits ?? 154);
    setRegulations(src.sectionF?.content ?? data.content?.sectionF?.content ?? "");
    setSummaryOfChanges(src.sectionG?.content ?? data.content?.sectionG?.content ?? "");

    if (src.philosophyGrace || data.content?.philosophyGrace) {
      setGracePhilosophyResult(src.philosophyGrace ?? data.content?.philosophyGrace);
    }

    if (draft) {
      setHasChanges(true);
      toast.info("Restored unsaved changes from your last session");
    }
  }, [id]);

  // Reload after an action (save, review decision).
  const fetchSubmission = useCallback(async () => {
    try {
      const response = await fetch(`/api/submissions/${id}`);
      if (response.ok) applySubmissionData(await response.json());
    } catch (err) {
      console.error("Failed to fetch submission:", err);
    }
  }, [id, applySubmissionData]);

  // First load.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/submissions/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Submission | null) => {
        if (!cancelled && data) applySubmissionData(data);
      })
      .catch((err) => console.error("Failed to fetch submission:", err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, applySubmissionData]);

  // Word count helper
  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const uploadRoleImage = async (role: "dean" | "hod", file: File) => {
    if (!submission) return;
    const setUploading = role === "dean" ? setUploadingDean : setUploadingHod;
    const setUrl = role === "dean" ? setDeanImageUrl : setHodImageUrl;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("role", role);

      const res = await fetch(`/api/submissions/${id}/image`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setUrl(data.imageUrl);
        setHasChanges(true);
        setImageVerificationFeedback({
          role,
          status: "success",
          message:
            data.message ||
            `${role === "dean" ? "Dean" : "HOD"} photo passed verification and was uploaded successfully.`,
        });
        toast.success(`${role === "dean" ? "Dean" : "HOD"} photo uploaded`);
      } else {
        const err = await res.json();
        setImageVerificationFeedback({
          role,
          status: "error",
          message:
            err.error ||
            `${role === "dean" ? "Dean" : "HOD"} photo failed verification. Please use a clearer professional passport-style image and try again.`,
        });
        toast.error(err.error || "Upload failed");
      }
    } catch {
      setImageVerificationFeedback({
        role,
        status: "error",
        message:
          "Image upload failed due to a network or server issue. Please try again.",
      });
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const philosophyWordCount = getWordCount(philosophy);
  const isPhilosophyValid =
    philosophyWordCount >= 150 && philosophyWordCount <= 250;

  const buildContentPayload = useCallback(() => ({
    programmeInfo: {
      ...submission?.content?.programmeInfo,
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
  }), [
    submission?.content?.programmeInfo,
    deanImageUrl, hodImageUrl, philosophy, gracePhilosophyResult,
    mission, vision, objectives, uniqueFeatures, employability,
    utmeRequirements, directEntryRequirements, transferRequirements,
    minimumDuration, graduationRequirements, minimumCGPA, totalUnits,
    regulations, summaryOfChanges,
  ]);

  // Persist draft to localStorage as a crash-recovery backup
  useEffect(() => {
    if (!hasChanges || !canEdit || !submission) return;
    try {
      localStorage.setItem(
        `submission-draft-${id}`,
        JSON.stringify(buildContentPayload()),
      );
    } catch { /* quota exceeded – non-critical */ }
  }, [hasChanges, canEdit, submission, id, buildContentPayload]);

  // Auto-save effect - debounced save after 3 seconds of no changes
  useEffect(() => {
    if (!hasChanges || !canEdit || !submission) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        const contentToSave = buildContentPayload();

        const response = await fetch(`/api/submissions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: contentToSave }),
        });

        if (response.ok) {
          setHasChanges(false);
          setAutoSaveStatus("saved");
          setLastSavedAt(new Date());
          setSubmission((prev) =>
            prev ? { ...prev, content: { ...prev.content, ...contentToSave } } : prev,
          );
          localStorage.removeItem(`submission-draft-${id}`);
        } else {
          setAutoSaveStatus("error");
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
        setAutoSaveStatus("error");
      }
    }, 3000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [hasChanges, canEdit, submission, id, buildContentPayload]);

  const handleSave = async (): Promise<boolean> => {
    if (!submission) return false;
    setIsSaving(true);

    try {
      const contentToSave = buildContentPayload();

      const response = await fetch(`/api/submissions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToSave }),
      });

      if (response.ok) {
        setHasChanges(false);
        setAutoSaveStatus("saved");
        setLastSavedAt(new Date());
        setSubmission((prev) =>
          prev ? { ...prev, content: { ...prev.content, ...contentToSave } } : prev,
        );
        localStorage.removeItem(`submission-draft-${id}`);
        toast.success("Draft saved successfully");
        return true;
      } else {
        toast.error("Failed to save draft");
        return false;
      }
    } catch (err) {
      console.error("Failed to save:", err);
      toast.error("Failed to save draft");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransition = async (action: string, remarks: string | null = null) => {
    if (!submission || !currentUser) return;

    // Flush pending saves before transition
    if (hasChanges && canEdit) {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      const saved = await handleSave();
      if (!saved) {
        toast.error("Please save your changes before continuing");
        return;
      }
    }

    // Validate before submission
    if (action === "SUBMIT") {
      const errors: string[] = [];
      if (!isPhilosophyValid) {
        errors.push("Philosophy must be 150-250 words");
      }
      if (!minimumDuration) {
        errors.push("Programme duration must be selected (4-6 years)");
      }
      // GRACE remains available as guidance, but can be made advisory while
      // the service is unavailable during the current review exercise.
      if (GRACE_SUBMISSION_REQUIRED && !gracePhilosophyResult?.passed) {
        errors.push("Programme philosophy must pass GRACE compliance check");
      }
      // Course descriptions are always required. GRACE compliance is only a
      // submission blocker when the deployment enables the gate.
      try {
        const coursesRes = await fetch(
          `/api/courses?submissionId=${submission.id}`,
        );
        if (coursesRes.ok) {
          const courses = await coursesRes.json();
          if (GRACE_SUBMISSION_REQUIRED) {
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
        errors.push("Could not verify the required course descriptions");
      }
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
      }
      if (errors.length > 0) {
        setSubmitBlockers(errors);
        return;
      }
    }

    if ((action === "REJECT" || action === "RETURN") && !remarks?.trim()) return;

    setIsTransitioning(true);
    try {
      const response = await fetch(`/api/submissions/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          remarks,
          ...(action === "APPROVE" &&
            requiredEvidence && { reference: reviewReference.trim() }),
          ...(action === "APPROVE" &&
            graceGate?.blocked &&
            approvingWithOverride && {
              graceOverride: { reason: graceOverrideReason.trim() },
            }),
          ...(phaseOverride && { override: { reason: phaseOverrideReason.trim() } }),
        }),
      });

      if (response.ok) {
        const messages: Record<string, string> = {
          SUBMIT:
            submission.currentPhase === 1
              ? "Sent to the School Board"
              : submission.currentPhase === 2
                ? "Sent to DAP Vetting"
                : "Revision resubmitted",
          APPROVE: `Done: ${approveActionLabel(submission.currentPhase).replace(/^Approve/, "approved")}`,
          REJECT: "Revision requested from the department",
          RETURN: "Returned to the previous phase for changes",
          RECALL: "Recalled from the Dean. It's a draft again; submit it when it's ready.",
        };
        toast.success(messages[action] || "Action completed");
        setReviewAction(null);
        setReviewRemarks("");
        setReviewReference("");
        setGraceOverrideOn(false);
        setGraceOverrideReason("");
        fetchSubmission();
      } else {
        const data = await response.json().catch(() => ({}));
        if (
          typeof data.code === "string" &&
          data.code.startsWith("GRACE_") &&
          action === "APPROVE"
        ) {
          // The approve dialog lists what hasn't passed; refresh it.
          fetchSubmission();
        } else if (Array.isArray(data.issues) && data.issues.length > 0) {
          setSubmitBlockers(data.issues);
        }
        toast.error(data.error || "Failed to complete action");
      }
    } catch (err) {
      console.error("Failed to transition:", err);
      toast.error("Failed to complete action");
    } finally {
      setIsTransitioning(false);
    }
  };

  const openReview = (action: "APPROVE" | "REJECT" | "RETURN") => {
    setReviewRemarks("");
    setReviewReference("");
    setGraceOverrideOn(false);
    setGraceOverrideReason("");
    setPhaseOverrideReason("");
    setReviewAction(action);
  };

  const graceCheckAbortRef = useRef<AbortController | null>(null);

  const checkPhilosophyGrace = async () => {
    if (!philosophy.trim() || !submission) return;

    if (graceCheckAbortRef.current) {
      graceCheckAbortRef.current.abort();
    }
    const controller = new AbortController();
    graceCheckAbortRef.current = controller;

    setGraceCheckingPhilosophy(true);
    setGracePhilosophyResult(null);
    setGracePhilosophyError(null);

    try {
      const res = await fetch("/api/grace-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "philosophy",
          submissionId: submission.id,
          title: `${submission.programme.name} - Programme Philosophy`,
          content: philosophy,
        }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (res.ok) {
        const result = await res.json();
        setGracePhilosophyResult(result);
      } else {
        const error = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setGracePhilosophyError(
          error?.error || "The GRACE service could not complete the check.",
        );
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setGracePhilosophyError(
        "Could not reach the GRACE compliance service. Please try again later.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setGraceCheckingPhilosophy(false);
        setHasChanges(true);
      }
    }
  };

  const applyPhilosophyGraceSuggestion = (content: string) => {
    setPhilosophy(content);
    setGracePhilosophyResult(null);
    setGracePhilosophyError(null);
    setHasChanges(true);
    toast.success("Corrected philosophy applied", {
      description: "Review it, make any edits you need, then run GRACE again.",
    });
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
        }),
      });

      if (response.ok) {
        const created = await response.json();
        setSubmission((prev) =>
          prev ? { ...prev, comments: [...prev.comments, created] } : prev,
        );
        setNewComment("");
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
    const newStatus = currentStatus === "OPEN" ? "RESOLVED" : "OPEN";
    try {
      const response = await fetch(
        `/api/submissions/${id}/comments/${commentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        },
      );

      if (response.ok) {
        setSubmission((prev) =>
          prev
            ? {
              ...prev,
              comments: prev.comments.map((c) =>
                c.id === commentId ? { ...c, status: newStatus as Comment["status"] } : c,
              ),
            }
            : prev,
        );
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

  // Q7: removing written text asks for DELETE first; an empty line is just
  // unsaved typing and goes at once.
  const removeListItem = async (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    index: number,
    items: string[],
    noun: string,
  ) => {
    const text = items[index]?.trim() ?? "";
    if (text) {
      const confirmed = await confirmDelete({
        title: `Delete this ${noun}?`,
        description: `"${text.length > 160 ? `${text.slice(0, 160)}...` : text}" is removed from this programme when the page saves.`,
        actionLabel: `Delete ${noun}`,
      });
      if (!confirmed) return;
    }
    setter((prev) => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };
  const removePhoto = async (who: "Dean" | "Head of Department", clear: () => void) => {
    const confirmed = await confirmDelete({
      title: `Remove the ${who}'s photo?`,
      description: "It is removed from this programme's page when the page saves. You can upload it again.",
      actionLabel: "Remove photo",
    });
    if (!confirmed) return;
    clear();
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-lg border bg-card" />
        <div className="h-96 animate-pulse rounded-lg border bg-card" />
      </div>
    );
  }

  if (!submission) {
    return (
      <EmptyState
        icon={FileText}
        title="Submission not found"
        description="It may have been removed, or you may not have access to it."
        action={
          <Button asChild variant="outline">
            <Link href={submissionsBackHref}>Back to submissions</Link>
          </Button>
        }
        className="mt-8"
      />
    );
  }

  const sectionComments = submission.comments.filter(
    (c) => c.section === activeSection,
  );

  const currentSection = sections.find((s) => s.key === activeSection);
  const SectionIcon = currentSection?.icon || FileText;

  const latestSendBack = [...(submission.phaseTransitions ?? [])]
    .filter((t) => t.action === "REJECT" || t.action === "RETURN")
    .sort(
      (a, b) =>
        new Date(b.transitionedAt).getTime() - new Date(a.transitionedAt).getTime(),
    )[0];
  const overrides = (submission.phaseTransitions ?? []).filter((t) => t.phaseOverride);
  const phaseOverrideField = phaseOverride ? (
    <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <Label htmlFor="phase-override-reason">
        Override reason (at least {phaseOverride.minLength} characters)
      </Label>
      <p className="text-xs">
        You don&apos;t own this phase. Your reason is flagged on the programme and in the Activity Log.
      </p>
      <Textarea
        id="phase-override-reason"
        rows={3}
        value={phaseOverrideReason}
        onChange={(event) => setPhaseOverrideReason(event.target.value)}
        className="bg-background text-foreground"
      />
      <p className="text-xs">
        {phaseOverrideReason.trim().length} of {phaseOverride.minLength} characters
      </p>
    </div>
  ) : null;
  const openCommentCount = submission.comments.filter((c) => c.status === "OPEN").length;
  const commentCountFor = (key: string) =>
    submission.comments.filter((c) => c.section === key && c.status === "OPEN").length;

  return (
    <div className="space-y-4">
      <PageHeader
        className="mb-2"
        title={submission.programme.name}
        description={
          <>
            {submission.programme.department.name} ·{" "}
            {submission.programme.department.school.name}
            {currentUser?.role === "HOD" && isAssignedSubmission && (
              <>
                {" · "}
                <Link href="/submissions/browse" className="text-primary hover:underline">
                  Browse other programmes
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <StatusBadge status={submission.status} />
            <Button asChild variant="ghost" size="sm">
              <Link href={submissionsBackHref}>
                <ArrowLeft />
                Back
              </Link>
            </Button>
          </>
        }
      />

      <PhaseTracker currentPhase={submission.currentPhase} status={submission.status} />
      {/* C3: this programme's deadline, next to the phase steps. */}
      <ProgrammeCountdown submissionId={submission.id} />

      {/* A2: a draft of an archived cycle opens read-only. */}
      {submission.cycle?.archivedAt && (
        <Alert>
          <Archive className="h-4 w-4" />
          <AlertDescription>
            This draft belongs to {submission.cycle.name}
            {submission.cycle.isTest ? ", a TEST cycle," : ","} which is in the Archive. It is
            read-only; restore the cycle from the Archive to work on it.
          </AlertDescription>
        </Alert>
      )}

      {/* D4: overrides are flagged on the programme. */}
      {overrides.length > 0 && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-inherit">
            <p className="font-medium">
              {overrides.length === 1 ? "1 phase override" : `${overrides.length} phase overrides`} on this
              programme
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {overrides.map((t) => (
                <li key={t.id}>
                  {t.performedBy.firstName} {t.performedBy.lastName} acted on Phase {t.fromPhase} on{" "}
                  {formatDate(t.transitionedAt)}: {t.phaseOverride?.reason}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Revision requested: show the reviewer's remarks up front */}
      {submission.status === "CORRECTIONS_REQUIRED" && latestSendBack && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-inherit">
            <p className="font-medium">
              Revision requested by {latestSendBack.performedBy.firstName}{" "}
              {latestSendBack.performedBy.lastName} on{" "}
              {formatDate(latestSendBack.transitionedAt)}
            </p>
            {latestSendBack.remarks && (
              <p className="mt-1 whitespace-pre-wrap">{latestSendBack.remarks}</p>
            )}
            {canSubmit && (
              <p className="mt-2 text-sm">
                Make the changes, then use <strong>{submitActionLabel}</strong> to send it onward.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Read-only banner for departmental users outside their assignment. */}
      {["HOD", "PROGRAMME_COORDINATOR"].includes(currentUser?.role || "") &&
        !isAssignedSubmission && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This submission is outside your assigned department or programme. This view is read-only.
          </AlertDescription>
        </Alert>
      )}

      {/* Action Bar */}
      <div className="sticky top-14 z-10 -mx-1 rounded-lg border bg-card/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && sectionSavesSeparately && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Save className="size-4" />
                  This section has its own Save button below.
                </span>
              )}
              {canEdit && !sectionSavesSeparately && (
                <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save draft
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
                            ({formatTime(lastSavedAt)})
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
                <div className="flex flex-col items-start gap-1">
                  <Button
                    variant="default"
                    onClick={() => {
                      if (phaseOverride) {
                        setPhaseOverrideReason("");
                        setSubmitOverrideOpen(true);
                      } else {
                        void handleTransition("SUBMIT");
                      }
                    }}
                    disabled={Boolean(submitClosed)}
                    aria-describedby={submitClosed ? "submit-closed-note" : undefined}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {submitActionLabel}
                  </Button>
                  {submitClosed && (
                    <p id="submit-closed-note" className="max-w-xs text-xs text-muted-foreground">
                      {submitClosed.message}
                    </p>
                  )}
                </div>
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
            <div className="flex flex-wrap items-center gap-2">
              {canRecall &&
                (submission.openedByDeanAt ? (
                  <p className="max-w-sm text-xs text-muted-foreground">
                    The Dean opened this programme on {formatDate(submission.openedByDeanAt)}, so it can no longer be
                    recalled. If it needs changes, ask the Dean to use &quot;{REQUEST_REVISION_LABEL}&quot;.
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    disabled={isTransitioning}
                    onClick={() => {
                      if (
                        confirm(
                          `${RECALL_LABEL}? ${submission.programme.name} goes back to Draft so you can keep working on it; submit it again when it's ready.`,
                        )
                      ) {
                        void handleTransition("RECALL");
                      }
                    }}
                  >
                    <Undo2 className="mr-2 h-4 w-4" />
                    {RECALL_LABEL}
                  </Button>
                ))}
              {(canReturn || canReject || canApprove) &&
                submission.status === "IN_REVIEW" && (
                <>
                  {canReturn && (
                    <Button variant="outline" onClick={() => openReview("RETURN")}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {returnActionLabel}
                    </Button>
                  )}
                  {canReject && (
                    <Button
                      variant="outline"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => openReview("REJECT")}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      {REQUEST_REVISION_LABEL}
                    </Button>
                  )}
                  {canApprove && (
                    <Button
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => openReview("APPROVE")}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {approveActionLabel(submission.currentPhase)}
                    </Button>
                  )}
                </>
              )}
              {submission.workflow?.clearedPreviousGate && (
                <p className="text-sm text-muted-foreground">
                  You moved this bulletin into this phase, so someone else must clear it.
                </p>
              )}

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Comments
                    {openCommentCount > 0 && (
                      <span className="ml-1 rounded-full bg-muted px-1.5 text-xs font-semibold text-foreground">
                        {openCommentCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-full overflow-y-auto p-6 sm:max-w-lg sm:p-8"
                >
                  <SheetHeader className="mb-4">
                    <SheetTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Comments
                      <Badge variant="secondary" className="ml-2">
                        {currentSection?.title}
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
                            className={`p-3 rounded-lg border ${comment.status === "RESOLVED" ? "opacity-50" : ""
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
                                  className={`text-xs ${commentTypeColors[comment.type]
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
                              {formatDate(comment.createdAt)}
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
      </div>

      {/* Main Content */}
      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        {/* Section navigation */}
        <nav aria-label="Bulletin sections" className="lg:sticky lg:top-32 lg:self-start">
          <div className="lg:hidden">
            <Label htmlFor="section-select" className="sr-only">
              Section
            </Label>
            <Select value={activeSection} onValueChange={setActiveSection}>
              <SelectTrigger id="section-select" className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sections.map((section, index) => (
                  <SelectItem key={section.key} value={section.key}>
                    {index + 1}. {section.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ol className="hidden space-y-0.5 rounded-lg border bg-card p-2 lg:block">
            {sections.map((section, index) => {
              const Icon = section.icon;
              const active = section.key === activeSection;
              const open = commentCountFor(section.key);
              return (
                <li key={section.key}>
                  <button
                    type="button"
                    onClick={() => setActiveSection(section.key)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md text-xs",
                        active ? "bg-primary text-primary-foreground" : "bg-muted",
                      )}
                    >
                      {index + 1}
                    </span>
                    <Icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{section.title}</span>
                    {open > 0 && (
                      <span
                        className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-foreground"
                        title={`${open} open comment${open === 1 ? "" : "s"}`}
                      >
                        {open}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Editor Panel */}
        <div className="min-w-0">
          <Card>
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
                    <PhotoUploadGuidance />
                    {imageVerificationFeedback && (
                      <Alert
                        variant={
                          imageVerificationFeedback.status === "error"
                            ? "destructive"
                            : "default"
                        }
                      >
                        <AlertDescription className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">
                              {imageVerificationFeedback.role === "dean"
                                ? "Dean"
                                : "HOD"}{" "}
                              image verification{" "}
                              {imageVerificationFeedback.status === "success"
                                ? "passed"
                                : "failed"}
                            </p>
                            <p>{imageVerificationFeedback.message}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setImageVerificationFeedback(null)}
                          >
                            Dismiss
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Dean Photo */}
                    <div className="space-y-3">
                      <Label>Dean&apos;s Photo</Label>
                      <div className="flex items-start gap-4">
                        {deanImageUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={deanImageUrl}
                            alt="Dean"
                            className="h-36 w-28 rounded-lg object-cover border"
                          />
                        ) : (
                          <div className="h-36 w-28 rounded-lg bg-muted border-2 border-dashed flex items-center justify-center">
                            <Camera className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        {canEdit && (
                          <div className="flex flex-col gap-2">
                            <input
                              ref={deanFileRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadRoleImage("dean", file);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deanFileRef.current?.click()}
                              disabled={uploadingDean}
                            >
                              {uploadingDean ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Camera className="h-4 w-4 mr-2" />
                              )}
                              {deanImageUrl ? "Replace" : "Upload"}
                            </Button>
                            {deanImageUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => void removePhoto("Dean", () => setDeanImageUrl(""))}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* HOD Photo */}
                    <div className="space-y-3">
                      <Label>HOD&apos;s Photo</Label>
                      <div className="flex items-start gap-4">
                        {hodImageUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={hodImageUrl}
                            alt="HOD"
                            className="h-36 w-28 rounded-lg object-cover border"
                          />
                        ) : (
                          <div className="h-36 w-28 rounded-lg bg-muted border-2 border-dashed flex items-center justify-center">
                            <Camera className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        {canEdit && (
                          <div className="flex flex-col gap-2">
                            <input
                              ref={hodFileRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadRoleImage("hod", file);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => hodFileRef.current?.click()}
                              disabled={uploadingHod}
                            >
                              {uploadingHod ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Camera className="h-4 w-4 mr-2" />
                              )}
                              {hodImageUrl ? "Replace" : "Upload"}
                            </Button>
                            {hodImageUrl && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() =>
                                  void removePhoto("Head of Department", () => setHodImageUrl(""))
                                }
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Staff, Course Structure and Course Details save on their own.
                    Once opened they stay mounted (just hidden) so switching
                    sections doesn't throw away rows that haven't been saved. */}
                {/* Staff Directory Section */}
                {visitedSections.has("staff") && (
                  <div hidden={activeSection !== "staff"}>
                    <StaffTable
                      departmentId={submission.programme.department.id}
                      disabled={!canEdit}
                      readOnlyReason={
                        !isAssignedSubmission
                          ? "You can only edit staff in your own department."
                          : !["DRAFT", "CORRECTIONS_REQUIRED"].includes(
                                submission.status,
                              )
                            ? "Staff entries can only be changed while the submission is a draft or has been returned for revision."
                            : "Your role does not have permission to edit staff entries."
                      }
                    />
                  </div>
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
                            {GRACE_SUBMISSION_REQUIRED ? (
                              <>
                                Ensure this philosophy statement is{" "}
                                <strong>GRACE compliant</strong> as proposed by
                                the Vice Chancellor.
                              </>
                            ) : (
                              <>
                                GRACE guidance is temporarily optional and will
                                not prevent submission.
                              </>
                            )}
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
                            className={`text-xs ${isPhilosophyValid
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
                            if (gracePhilosophyError) {
                              setGracePhilosophyError(null);
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
                        <GraceResultPanel
                          result={gracePhilosophyResult}
                          onApplySuggestion={
                            canEdit ? applyPhilosophyGraceSuggestion : undefined
                          }
                        />
                      )}
                      {gracePhilosophyError && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            GRACE service error: {gracePhilosophyError}
                          </AlertDescription>
                        </Alert>
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
                                  void removeListItem(setObjectives, index, objectives, "objective")
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
                                  void removeListItem(setUniqueFeatures, index, uniqueFeatures, "unique feature")
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
                                  void removeListItem(setEmployability, index, employability, "employability skill")
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

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Minimum CGPA *</Label>
                        {canEdit ? (
                          <>
                            <Input
                              type="number"
                              step="0.01"
                              min={MINIMUM_CGPA_RANGE.min}
                              max={MINIMUM_CGPA_RANGE.max}
                              value={minimumCGPA}
                              aria-describedby="minimum-cgpa-help"
                              onChange={(e) => {
                                setMinimumCGPA(parseFloat(e.target.value) || UNIVERSITY_MINIMUM_CGPA);
                                setHasChanges(true);
                              }}
                            />
                            {/* Rule W6: 2.00 to 5.00; a higher figure must be a programme rule. */}
                            <p id="minimum-cgpa-help" className="text-xs text-muted-foreground">
                              {minimumCGPA < MINIMUM_CGPA_RANGE.min || minimumCGPA > MINIMUM_CGPA_RANGE.max
                                ? "Use a figure from 2.00 to 5.00. The Academic Policy minimum is 2.00."
                                : minimumCGPA > UNIVERSITY_MINIMUM_CGPA
                                  ? "Higher than the university minimum of 2.00. Keep it only if it is a rule of this programme (as in Nursing or Medicine)."
                                  : "The Academic Policy minimum to graduate is 2.00."}
                            </p>
                          </>
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
                {visitedSections.has("courses") && (
                  <div hidden={activeSection !== "courses"}>
                  <CourseTable
                    submissionId={submission.id}
                    departmentId={submission.programme.department.id}
                    programmeDuration={submission.programme.duration || 4}
                    disabled={!canEdit}
                    onValidationChange={(isValid, errors) => {
                      if (!isValid) {
                        setValidationErrors(errors);
                      } else {
                        setValidationErrors([]);
                      }
                    }}
                  />
                  </div>
                )}

                {/* Course Descriptions Section */}
                {visitedSections.has("descriptions") && (
                  <div hidden={activeSection !== "descriptions"}>
                    <CourseDescriptionForm
                      submissionId={submission.id}
                      disabled={!canEdit}
                    />
                  </div>
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
      {/* Approve / send back dialog */}
      <Dialog
        open={reviewAction !== null}
        onOpenChange={(open) => {
          if (!open && !isTransitioning) setReviewAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "APPROVE"
                ? approveActionLabel(submission.currentPhase)
                : reviewAction === "REJECT"
                  ? REQUEST_REVISION_LABEL
                  : returnActionLabel}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "APPROVE"
                ? submission.currentPhase >= TOTAL_PHASES - 1
                  ? "This gives the bulletin its final approval. The department will be emailed."
                  : `The bulletin moves on to ${phaseHeading(submission.currentPhase + 1)}.`
                : reviewAction === "REJECT"
                  ? "The bulletin goes back to the department marked Revision requested. They'll be emailed your remarks."
                  : "The bulletin goes back one phase with your remarks, and the department is emailed."}
            </DialogDescription>
          </DialogHeader>
          {reviewAction === "APPROVE" && graceGate?.blocked && (
            <div
              role="alert"
              className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
            >
              <p className="font-medium text-destructive">
                GRACE results that haven&apos;t passed for the text as it stands
              </p>
              <ul className="space-y-1">
                {graceGate.issues.map((issue) => (
                  <li key={issue} className="flex gap-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
              {graceGate.canOverride ? (
                <div className="space-y-2 border-t border-destructive/20 pt-3">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id="grace-override"
                      checked={graceOverrideOn}
                      onCheckedChange={(checked) => setGraceOverrideOn(checked === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="grace-override" className="leading-snug font-normal">
                      Approve anyway as a logged override
                    </Label>
                  </div>
                  {graceOverrideOn && (
                    <div className="space-y-1.5">
                      <Label htmlFor="grace-override-reason">Reason for the override *</Label>
                      <Textarea
                        id="grace-override-reason"
                        rows={3}
                        maxLength={GRACE_OVERRIDE_REASON_LENGTH.max}
                        value={graceOverrideReason}
                        onChange={(e) => setGraceOverrideReason(e.target.value)}
                        placeholder="Why this bulletin should move on before these results pass"
                      />
                      <p className="text-xs text-muted-foreground">
                        At least {GRACE_OVERRIDE_REASON_LENGTH.min} characters. It is kept
                        permanently in the workflow record, with the results listed above.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  It can&apos;t be approved until these pass. Request a revision,
                  or ask a Super Administrator to approve it with a logged
                  override.
                </p>
              )}
            </div>
          )}
          {reviewAction === "APPROVE" && requiredEvidence && (
            <div className="space-y-2">
              <Label htmlFor="review-reference">{requiredEvidence} *</Label>
              <Input
                id="review-reference"
                value={reviewReference}
                maxLength={200}
                onChange={(e) => setReviewReference(e.target.value)}
                placeholder="As recorded in the minutes"
              />
            </div>
          )}
          {phaseOverride && phaseOverrideField}
          <div className="space-y-2">
            <Label htmlFor="review-remarks">
              {reviewAction === "APPROVE" ? "Remarks (optional)" : "What needs to change?"}
            </Label>
            <Textarea
              id="review-remarks"
              rows={5}
              value={reviewRemarks}
              onChange={(e) => setReviewRemarks(e.target.value)}
              placeholder={
                reviewAction === "APPROVE"
                  ? "Anything the department should know"
                  : "Be specific so the department can make the changes in one go"
              }
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewAction(null)}
              disabled={isTransitioning}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                reviewAction &&
                handleTransition(reviewAction, reviewRemarks.trim() || null)
              }
              disabled={
                isTransitioning ||
                (reviewAction !== "APPROVE" && !reviewRemarks.trim()) ||
                (reviewAction === "APPROVE" &&
                  Boolean(requiredEvidence) &&
                  !reviewReference.trim()) ||
                (reviewAction === "APPROVE" && approvalStoppedByGrace) ||
                !phaseOverrideReasonOk
              }
              className={
                reviewAction === "APPROVE"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : undefined
              }
              variant={reviewAction === "REJECT" ? "destructive" : "default"}
            >
              {isTransitioning && <Loader2 className="animate-spin" />}
              {reviewAction === "APPROVE"
                ? graceGate?.blocked && approvingWithOverride
                  ? "Approve with override"
                  : approveActionLabel(submission.currentPhase)
                : reviewAction === "REJECT"
                  ? REQUEST_REVISION_LABEL
                  : "Return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Things to fix before submitting */}
      <Dialog
        open={submitBlockers !== null}
        onOpenChange={(open) => {
          if (!open) setSubmitBlockers(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A few things to finish first</DialogTitle>
            <DialogDescription>
              Fix these, then submit for review again.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            {submitBlockers?.map((blocker) => (
              <li key={blocker} className="flex gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>{blocker}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setSubmitBlockers(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* D4: Submit on a phase you don't own is an override. */}
      <Dialog open={submitOverrideOpen} onOpenChange={(open) => !isTransitioning && setSubmitOverrideOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{submitActionLabel} as an override?</DialogTitle>
            <DialogDescription>
              You don&apos;t own Phase {submission.currentPhase}. Submitting here is an override: it is flagged on
              this programme and in the Activity Log with your reason.
            </DialogDescription>
          </DialogHeader>
          {phaseOverrideField}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOverrideOpen(false)} disabled={isTransitioning}>
              Cancel
            </Button>
            <Button
              disabled={isTransitioning || !phaseOverrideReasonOk}
              onClick={async () => {
                await handleTransition("SUBMIT");
                setSubmitOverrideOpen(false);
              }}
            >
              {isTransitioning && <Loader2 className="animate-spin" />}
              {submitActionLabel} with override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {deleteDialog}
    </div>
  );
}
