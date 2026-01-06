"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser, usePermission } from "@/contexts/user-context";
import { getRoleDisplayName } from "@/lib/auth";
import {
  RichTextEditor,
  RichTextViewer,
} from "@/components/editor/rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";

interface Submission {
  id: string;
  title: string;
  academicYear: string;
  currentPhase: number;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  submittedAt: string | null;
  approvedAt: string | null;
  programme: {
    name: string;
    code: string;
    department: {
      name: string;
      school: { name: string; code: string };
    };
  };
  createdBy: {
    firstName: string;
    lastName: string;
    role: string;
  };
  content: {
    sectionA: { content?: string } | null;
    sectionB: { content?: string } | null;
    sectionC: { content?: string } | null;
    sectionD: { content?: string } | null;
    sectionE: { content?: string } | null;
    sectionF: { content?: string } | null;
    sectionG: { content?: string } | null;
    sectionH: { content?: string } | null;
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

const sectionInfo: Record<string, { title: string; description: string }> = {
  A: {
    title: "General Programme Information",
    description:
      "School, Department, Programme Title, Degree, Duration, Mode, Coordinator",
  },
  B: {
    title: "Programme Philosophy & Objectives",
    description:
      "Philosophy (150-250 words), Vision, Mission, Learning Outcomes",
  },
  C: {
    title: "Admission & Graduation Requirements",
    description: "UTME/Direct Entry criteria, Graduation requirements",
  },
  D: {
    title: "Entrepreneurial Content",
    description: "Entrepreneurship philosophy, courses, skills, partnerships",
  },
  E: {
    title: "Programme Structure & Course Descriptions",
    description: "Semester-by-semester structure, course details",
  },
  F: {
    title: "Programme Regulations",
    description:
      "Assessment, Probation, Internship, Project/Thesis requirements",
  },
  G: {
    title: "Summary of Changes",
    description: "Changes to structure, new/deleted courses, policy changes",
  },
  H: {
    title: "Approvals",
    description: "Coordinator, HoD, Dean signatures and dates",
  },
};

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

export default function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { currentUser } = useUser();
  const { hasPermission } = usePermission();

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("A");
  const [editedContent, setEditedContent] = useState<Record<string, string>>(
    {}
  );
  const [hasChanges, setHasChanges] = useState(false);

  // Comments state
  const [newComment, setNewComment] = useState("");
  const [commentType, setCommentType] = useState<string>("SUGGESTION");
  const [isAddingComment, setIsAddingComment] = useState(false);

  const canEdit =
    hasPermission("edit:submission") && submission?.status === "DRAFT";
  const canReview = hasPermission("review:submission");
  const canApprove = hasPermission("approve:submission");

  const fetchSubmission = async () => {
    try {
      const response = await fetch(`/api/submissions/${id}`);
      if (response.ok) {
        const data = await response.json();
        setSubmission(data);
        // Initialize edited content from submission
        if (data.content) {
          const content: Record<string, string> = {};
          Object.keys(sectionInfo).forEach((key) => {
            const sectionKey = `section${key}` as keyof typeof data.content;
            content[key] = data.content[sectionKey]?.content || "";
          });
          setEditedContent(content);
        }
      }
    } catch (err) {
      console.error("Failed to fetch submission:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmission();
  }, [id]);

  const handleContentChange = (section: string, content: string) => {
    setEditedContent((prev) => ({ ...prev, [section]: content }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!submission) return;
    setIsSaving(true);

    try {
      const contentToSave: Record<string, { content: string }> = {};
      Object.keys(editedContent).forEach((key) => {
        contentToSave[`section${key}`] = { content: editedContent[key] };
      });

      const response = await fetch(`/api/submissions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentToSave }),
      });

      if (response.ok) {
        setHasChanges(false);
        fetchSubmission();
      }
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransition = async (action: string) => {
    if (!submission || !currentUser) return;

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
        fetchSubmission();
      }
    } catch (err) {
      console.error("Failed to transition:", err);
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
    currentStatus: string
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
        }
      );

      if (response.ok) {
        fetchSubmission();
      }
    } catch (err) {
      console.error("Failed to update comment:", err);
    }
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
    (c) => c.section === activeSection
  );

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
              <Badge variant="outline">{submission.academicYear}</Badge>
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
                <>
                  <Button
                    onClick={handleSave}
                    disabled={!hasChanges || isSaving}
                  >
                    {isSaving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Draft
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => handleTransition("SUBMIT")}
                    disabled={submission.status !== "DRAFT"}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Submit for Review
                  </Button>
                </>
              )}
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor Panel */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <Tabs value={activeSection} onValueChange={setActiveSection}>
                <TabsList className="grid grid-cols-8 w-full">
                  {Object.keys(sectionInfo).map((key) => (
                    <TabsTrigger key={key} value={key}>
                      {key}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold">
                    Section {activeSection}: {sectionInfo[activeSection].title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {sectionInfo[activeSection].description}
                  </p>
                </div>
                <Separator />
                {canEdit ? (
                  <RichTextEditor
                    content={editedContent[activeSection] || ""}
                    onChange={(content) =>
                      handleContentChange(activeSection, content)
                    }
                    placeholder={`Enter content for Section ${activeSection}...`}
                  />
                ) : (
                  <RichTextViewer
                    content={editedContent[activeSection] || ""}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Comments Panel */}
        <div>
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Comments
                </span>
                <Badge variant="secondary">Section {activeSection}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Comment Form */}
              {canReview && (
                <div className="space-y-3 pb-4 border-b">
                  <Textarea
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                  />
                  <div className="flex items-center gap-2">
                    <Select value={commentType} onValueChange={setCommentType}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SUGGESTION">Suggestion</SelectItem>
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
              <ScrollArea className="h-[400px]">
                {sectionComments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No comments for Section {activeSection}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sectionComments.map((comment) => (
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
                              handleResolveComment(comment.id, comment.status)
                            }
                          >
                            {comment.status === "OPEN" ? "Resolve" : "Reopen"}
                          </Button>
                        </div>
                        <p className="text-sm mt-1">{comment.content}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(comment.createdAt).toLocaleDateString()}
                          <span>• Phase {comment.phase}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
