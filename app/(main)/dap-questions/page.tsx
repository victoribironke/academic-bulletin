"use client";

/**
 * DAP's inbox for questions from the drafts (task H6): each question with its
 * programme, section and field, when the answer is due (one working day), and
 * an Overdue flag. Officers see the questions sent to them first.
 */
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox, Loader2 } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { TableCard } from "@/components/shared/table-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/dates/format";

type Question = {
  id: string;
  submissionId: string;
  section: string;
  sectionTitle: string;
  field: string | null;
  question: string;
  status: string;
  answer: string | null;
  askedAt: string;
  dueAt: string;
  overdue: boolean;
  askedBy: string | null;
  officer: string | null;
  answeredBy: string | null;
  programme: string;
  department: string;
  school: string;
};

export default function DapQuestionsPage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const allowed = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const [status, setStatus] = useState<"OPEN" | "ALL">("OPEN");
  const [mine, setMine] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [answering, setAnswering] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const answerId = useId();

  useEffect(() => {
    if (!userLoading && !allowed) router.push("/dashboard");
  }, [userLoading, allowed, router]);

  useEffect(() => {
    if (userLoading || !allowed) return;
    let cancelled = false;
    const params = new URLSearchParams();
    if (status === "OPEN") params.set("status", "open");
    if (mine) params.set("mine", "1");
    fetch(`/api/dap-questions?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setQuestions(data);
          setFailed(null);
        } else {
          setFailed(data.error ?? "Couldn't load the questions.");
        }
      })
      .catch(() => {
        if (!cancelled) setFailed("Couldn't load the questions.");
      });
    return () => {
      cancelled = true;
    };
  }, [userLoading, allowed, status, mine, reloadKey]);

  const save = async () => {
    if (!answering) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/dap-questions/${answering.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(`Answer sent to ${answering.askedBy ?? "the person who asked"}.`);
        setAnswering(null);
        setAnswer("");
        setReloadKey((key) => key + 1);
      } else {
        toast.error("Couldn't send the answer", { description: data.error ?? "Please try again." });
      }
    } finally {
      setSaving(false);
    }
  };

  if (!userLoading && !allowed) return null;
  const overdue = questions?.filter((question) => question.overdue).length ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Questions for DAP"
        description="Questions from Heads of Department and Deans about a section or field of their drafts. Each goes to the DAP officer for the school, who aims to answer within one working day; the answer appears on the draft and by email."
      />

      <div className="flex flex-wrap items-center gap-4">
        <Tabs value={status} onValueChange={(value) => setStatus(value as "OPEN" | "ALL")}>
          <TabsList>
            <TabsTrigger value="OPEN">Waiting{overdue > 0 && status === "OPEN" ? ` (${overdue} overdue)` : ""}</TabsTrigger>
            <TabsTrigger value="ALL">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={mine} onCheckedChange={setMine} />
          Only the questions sent to me
        </label>
      </div>

      {failed ? (
        <ErrorState title={failed} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : !questions ? (
        <TableSkeleton columns={4} rows={3} />
      ) : questions.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={status === "OPEN" ? "No questions waiting" : "No questions yet"}
          description="Questions asked with Ask DAP on a draft appear here."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead scope="col">Question</TableHead>
                <TableHead scope="col" className="hidden md:table-cell">
                  Programme
                </TableHead>
                <TableHead scope="col" className="hidden sm:table-cell">
                  Answer due
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((question) => (
                <TableRow key={question.id}>
                  <TableCell className="max-w-md align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={question.status === "ANSWERED" ? "secondary" : question.overdue ? "destructive" : "outline"}>
                        {question.status === "ANSWERED" ? "Answered" : question.overdue ? "Overdue" : "Waiting"}
                      </Badge>
                      <span className="font-medium">
                        {question.sectionTitle}
                        {question.field ? `: ${question.field}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{question.question}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {question.askedBy ?? "Someone"}, {formatDateTime(question.askedAt)}
                      {question.officer ? ` · to ${question.officer}` : " · no officer named for this school"}
                    </p>
                    {question.answer && (
                      <p className="mt-1 border-l-2 border-primary/40 pl-2 text-sm">
                        <span className="font-medium">{question.answeredBy ?? "DAP"}:</span> {question.answer}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <Link
                      href={`/submissions/${question.submissionId}?section=${question.section}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {question.programme}
                    </Link>
                    <p className="text-xs text-muted-foreground">{question.school}</p>
                  </TableCell>
                  <TableCell className="hidden align-top text-sm sm:table-cell">
                    {question.status === "ANSWERED" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={question.overdue ? "font-medium text-destructive" : "text-muted-foreground"}>
                        {formatDateTime(question.dueAt)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Button
                      size="sm"
                      variant={question.status === "OPEN" ? "default" : "ghost"}
                      onClick={() => {
                        setAnswering(question);
                        setAnswer(question.answer ?? "");
                      }}
                    >
                      {question.status === "OPEN" ? "Answer" : "Edit answer"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <Dialog open={answering !== null} onOpenChange={(next) => !saving && !next && setAnswering(null)}>
        <DialogContent>
          {answering && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <DialogHeader>
                <DialogTitle>Answer {answering.askedBy ?? "the question"}</DialogTitle>
                <DialogDescription>
                  {answering.programme}: {answering.sectionTitle}
                  {answering.field ? `, ${answering.field}` : ""}. &ldquo;{answering.question}&rdquo;
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor={answerId}>Answer</Label>
                <Textarea id={answerId} value={answer} onChange={(event) => setAnswer(event.target.value)} rows={5} maxLength={4000} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAnswering(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || answer.trim().length < 2}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Send answer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
