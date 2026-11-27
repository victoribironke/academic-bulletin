"use client";

/**
 * Task G2: a lecturer's page. Only the courses their Head of Department gave
 * them: write the learning outcomes (one per line, at least three) and the
 * course content, check it with GRACE, then mark it "Ready for my Head".
 * The Head accepts it or returns it with a note.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send, Sparkles } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TRY_AGAIN } from "@/lib/messages";
import { AiFirstDraft } from "@/components/courses/ai-first-draft";

type Status = "ASSIGNED" | "READY" | "ACCEPTED" | "RETURNED";
type Item = {
  id: string;
  status: Status;
  note: string | null;
  programme: string;
  canEdit: boolean;
  course: {
    id: string;
    code: string;
    title: string;
    units: number;
    level: number;
    learningOutcomes: string[];
    courseContent: string;
    graceStatus: string | null;
    gracePass: boolean;
  };
};

const STATUS_WORDS: Record<Status, string> = {
  ASSIGNED: "With you",
  READY: "With your Head",
  ACCEPTED: "Accepted by your Head",
  RETURNED: "Returned to you",
};

function CourseCard({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const [outcomes, setOutcomes] = useState(item.course.learningOutcomes.join("\n"));
  const [content, setContent] = useState(item.course.courseContent);
  const [busy, setBusy] = useState<string | null>(null);
  const [grace, setGrace] = useState<{ passed: boolean; explanation?: string; suggestedContent?: string } | null>(null);
  const lines = outcomes.split("\n").map((line) => line.trim()).filter(Boolean);
  const dirty = outcomes !== item.course.learningOutcomes.join("\n") || content !== item.course.courseContent;

  const save = async () => {
    setBusy("save");
    try {
      const res = await fetch(`/api/courses/${item.course.id}/description`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learningOutcomes: lines, courseContent: content }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't save the course", { description: body.error ?? TRY_AGAIN });
        return false;
      }
      toast.success(`${item.course.code} saved`);
      onChanged();
      return true;
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    if (dirty && !(await save())) return;
    setBusy("grace");
    try {
      const res = await fetch("/api/grace-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "course", courseId: item.course.id, title: item.course.title, content }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("GRACE couldn't check the course", { description: body.error ?? TRY_AGAIN });
        return;
      }
      setGrace(body.result ?? body);
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  const ready = async () => {
    if (dirty && !(await save())) return;
    setBusy("ready");
    try {
      const res = await fetch(`/api/lecturer/courses/${item.id}/ready`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't send it to your Head", { description: body.error ?? TRY_AGAIN });
        return;
      }
      toast.success(`${item.course.code} is with your Head of Department`);
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {item.course.code}: {item.course.title}
        </CardTitle>
        <CardDescription>
          {item.programme} · {item.course.level} level · {item.course.units} unit{item.course.units === 1 ? "" : "s"} · <span className="font-medium">{STATUS_WORDS[item.status]}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.status === "RETURNED" && item.note && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
            Your Head&apos;s note: {item.note}
          </p>
        )}
        {/* B11: an AI first draft while the course has no text yet. */}
        {item.canEdit && (!content.trim() || lines.length < 3) && (
          <AiFirstDraft
            courseId={item.course.id}
            onUse={(draftOutcomes, draftContent) => {
              setOutcomes(draftOutcomes.join("\n"));
              setContent(draftContent);
            }}
          />
        )}
        <div className="space-y-1">
          <Label htmlFor={`${item.id}-outcomes`}>At the end of this course, students should be able to: (one per line, at least three)</Label>
          <Textarea id={`${item.id}-outcomes`} value={outcomes} rows={5} disabled={!item.canEdit} onChange={(event) => setOutcomes(event.target.value)} />
          <p className="text-xs text-muted-foreground">{lines.length} outcome{lines.length === 1 ? "" : "s"}; start each with an action word (explain, apply, design…).</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${item.id}-content`}>Course content</Label>
          <Textarea id={`${item.id}-content`} value={content} rows={8} disabled={!item.canEdit} onChange={(event) => setContent(event.target.value)} />
        </div>
        {grace && (
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p className="font-medium">{grace.passed ? "It passes GRACE." : "It doesn't pass GRACE yet."}</p>
            {grace.explanation && <p className="text-muted-foreground">{grace.explanation}</p>}
            {!grace.passed && grace.suggestedContent?.trim() && item.canEdit && (
              <>
                <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-muted-foreground">{grace.suggestedContent}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setContent(grace.suggestedContent!)}>
                  Use GRACE&apos;s version of the content
                </Button>
              </>
            )}
          </div>
        )}
        {item.canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void save()} disabled={!dirty || busy !== null}>
              {busy === "save" && <Loader2 className="animate-spin" />} Save
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void check()} disabled={!content.trim() || busy !== null}>
              {busy === "grace" ? <Loader2 className="animate-spin" /> : <Sparkles />} Check with GRACE
            </Button>
            <Button type="button" size="sm" onClick={() => void ready()} disabled={!content.trim() || lines.length < 3 || busy !== null}>
              {busy === "ready" ? <Loader2 className="animate-spin" /> : <Send />} Ready for my Head
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {item.status === "ACCEPTED" ? "Your Head accepted it. Nothing more to do." : "It is with your Head of Department now."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function MyCoursesPage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const allowed = currentUser?.role === "LECTURER";
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!userLoading && currentUser && !allowed) router.push("/dashboard");
  }, [userLoading, currentUser, allowed, router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/lecturer/courses").catch(() => null);
    if (!res?.ok) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setItems((await res.json()).courses);
  }, []);
  useEffect(() => {
    if (!allowed) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [allowed, load]);

  if (!allowed) return null;
  if (failed) return <ErrorState title="Couldn't load your courses." onRetry={() => void load()} />;
  if (!items) return <TableSkeleton columns={3} rows={4} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Courses"
        description="The courses your Head of Department gave you. Write each one's outcomes and content, check it with GRACE, then send it to your Head."
      />
      {items.length === 0 ? (
        <EmptyState title="No courses yet" description="Your Head of Department hasn't given you a course yet." />
      ) : (
        items.map((item) => <CourseCard key={`${item.id}-${item.status}`} item={item} onChanged={() => void load()} />)
      )}
    </div>
  );
}
