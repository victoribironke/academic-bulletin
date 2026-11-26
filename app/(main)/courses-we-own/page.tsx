"use client";

/**
 * "Courses we own" (task B6, with rule W16): the courses a department or
 * school teaches for the university, the programmes that use each one, and
 * their learning outcomes and content, written once for all of them. Heads
 * of Department edit their department's; Deans read their school's; DAP
 * picks any owner, the General Education desk or the courses with no owner.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpen, Loader2, Pencil, FileText } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { TableCard, TableToolbar } from "@/components/shared/table-toolbar";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TRY_AGAIN } from "@/lib/messages";
import { FieldHelp } from "@/components/forms/field-help";

const MINIMUM_OUTCOMES = 3;
const ALLOWED = ["HOD", "PROGRAMME_COORDINATOR", "DEAN", "ADMIN", "SUPER_ADMIN"];

type OwnedCourse = {
  id: string;
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number | null;
  owner: string;
  programmes: { code: string; name: string }[];
  learningOutcomes: string[];
  courseContent: string;
  labWork: string;
  entrepreneurialAspect: string;
  complete: boolean;
};

type Result = {
  owner: { key: string; name: string };
  canEdit: boolean;
  courses: OwnedCourse[];
  owners?: { key: string; name: string; count: number }[];
};

type Draft = { learningOutcomes: string; courseContent: string; labWork: string; entrepreneurialAspect: string };

const semesterLabel = (semester: number | null) => (semester === 1 ? "1st" : semester === 2 ? "2nd" : "Sessional");

export default function CoursesWeOwnPage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const allowed = Boolean(currentUser && ALLOWED.includes(currentUser.role));
  const isAdministrator = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const [owner, setOwner] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "MISSING">("ALL");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<OwnedCourse | null>(null);
  const [draft, setDraft] = useState<Draft>({ learningOutcomes: "", courseContent: "", labWork: "", entrepreneurialAspect: "" });
  const [saving, setSaving] = useState(false);
  const outcomesId = useId();
  const contentId = useId();
  const labId = useId();
  const entrepreneurialId = useId();

  useEffect(() => {
    if (!userLoading && !allowed) router.push("/dashboard");
  }, [userLoading, allowed, router]);

  useEffect(() => {
    if (userLoading || !allowed) return;
    let cancelled = false;
    fetch(`/api/courses-we-own${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setResult(data);
          setFailed(null);
        } else {
          setFailed(data.error ?? "Couldn't load the courses.");
        }
      })
      .catch(() => {
        if (!cancelled) setFailed("Couldn't load the courses.");
      });
    return () => {
      cancelled = true;
    };
  }, [userLoading, allowed, owner, reloadKey]);

  const missing = result?.courses.filter((course) => !course.complete).length ?? 0;
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (result?.courses ?? []).filter(
      (course) =>
        (filter === "ALL" || !course.complete) &&
        (!words || `${course.code} ${course.title}`.toLowerCase().includes(words) || course.code.replace(/\s+/g, "").toLowerCase().includes(words.replace(/\s+/g, ""))),
    );
  }, [result, filter, search]);

  const open = (course: OwnedCourse) => {
    setEditing(course);
    setDraft({
      learningOutcomes: course.learningOutcomes.join("\n"),
      courseContent: course.courseContent,
      labWork: course.labWork,
      entrepreneurialAspect: course.entrepreneurialAspect,
    });
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/courses-we-own/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const reached = data.draftRowsUpdated ?? 0;
        toast.success(`Saved ${editing.code}.`, {
          description:
            reached > 0
              ? `${reached} open ${reached === 1 ? "draft shows" : "drafts show"} the new text.`
              : "Drafts that use it show the new text once they include the course.",
        });
        setEditing(null);
        setReloadKey((key) => key + 1);
      } else {
        toast.error("Couldn't save the description", { description: data.error ?? TRY_AGAIN });
      }
    } finally {
      setSaving(false);
    }
  };

  if (!userLoading && !allowed) return null;

  const outcomeCount = draft.learningOutcomes.split(/\r?\n/).filter((line) => line.trim()).length;
  const readOnly = !result?.canEdit;

  return (
    <div className="space-y-4">
      <PageHeader
        title={isAdministrator ? "Course owners" : "Courses we own"}
        description={
          isAdministrator
            ? "Every course Babcock offers has an owner, a department or a school, that writes its learning outcomes and content for every programme that uses it. General Education courses belong to the General Education desk. Change an owner in Master Courses."
            : "The courses your department teaches for the university. Their learning outcomes and content are the same in every programme that uses them: what you save here reaches every programme's open draft at once."
        }
      />

      <TableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by code or title"
        filters={
          <>
            {isAdministrator && result?.owners && (
              <Select value={result.owner.key} onValueChange={(value) => setOwner(value)}>
                <SelectTrigger className="w-full bg-card sm:w-72" aria-label="Owner">
                  <SelectValue placeholder="Choose an owner" />
                </SelectTrigger>
                <SelectContent>
                  {result.owners.map((choice) => (
                    <SelectItem key={choice.key} value={choice.key}>
                      {choice.name} ({choice.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Tabs value={filter} onValueChange={(value) => setFilter(value as "ALL" | "MISSING")}>
              <TabsList>
                <TabsTrigger value="ALL">All{result ? ` (${result.courses.length})` : ""}</TabsTrigger>
                <TabsTrigger value="MISSING">Description missing{result ? ` (${missing})` : ""}</TabsTrigger>
              </TabsList>
            </Tabs>
          </>
        }
      />

      {failed ? (
        <ErrorState title={failed} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : !result ? (
        <TableSkeleton columns={4} rows={5} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={
            result.courses.length === 0
              ? "No courses here yet"
              : filter === "MISSING" && !search
                ? "Every course has its description"
                : "No courses match"
          }
          description={
            result.courses.length === 0
              ? "Courses appear here once DAP records their owner in the Registry."
              : "Try another search or show all courses."
          }
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead scope="col">Course</TableHead>
                <TableHead scope="col" className="hidden md:table-cell">
                  Used by
                </TableHead>
                <TableHead scope="col" className="hidden sm:table-cell">
                  Description
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="max-w-md align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{course.code}</Badge>
                      <span className="font-medium">{course.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {course.level} level, {semesterLabel(course.semester)} semester, {course.units}{" "}
                      {course.units === 1 ? "unit" : "units"}
                      {result.owner.key.startsWith("school:") || isAdministrator ? ` · ${course.owner}` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="hidden align-top text-sm md:table-cell">
                    {course.programmes.length === 0 ? (
                      <span className="text-muted-foreground">No programme yet</span>
                    ) : (
                      <span title={course.programmes.map((programme) => programme.name).join(", ")}>
                        {course.programmes.length === 1
                          ? course.programmes[0].name
                          : `${course.programmes.length} programmes`}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden align-top sm:table-cell">
                    {course.complete ? (
                      <Badge variant="secondary">Complete</Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-300 text-amber-800 dark:text-amber-300">
                        {course.courseContent ? `${course.learningOutcomes.length} of ${MINIMUM_OUTCOMES} outcomes` : "No content"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Button size="sm" variant="outline" onClick={() => open(course)}>
                      {readOnly ? <FileText className="mr-1 h-4 w-4" /> : <Pencil className="mr-1 h-4 w-4" />}
                      {readOnly ? "View" : "Edit"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <Dialog open={editing !== null} onOpenChange={(next) => !saving && !next && setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{editing.code}</Badge>
                  {editing.title}
                </DialogTitle>
                <DialogDescription>
                  {editing.programmes.length > 0
                    ? `Used by ${editing.programmes.map((programme) => programme.name).join(", ")}.`
                    : "No programme uses it yet."}{" "}
                  {readOnly
                    ? `${editing.owner} writes its description.`
                    : "What you save becomes its description in every programme's open draft; drafts already under review keep theirs."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor={outcomesId}>Learning outcomes</Label>
                <FieldHelp field="learningOutcomes" value={draft.learningOutcomes} />
                <p className="text-xs text-muted-foreground">
                  At the end of this course, students should be able to: (one per line, starting with an action word; at
                  least {MINIMUM_OUTCOMES})
                </p>
                <Textarea
                  id={outcomesId}
                  value={draft.learningOutcomes}
                  onChange={(event) => setDraft({ ...draft, learningOutcomes: event.target.value })}
                  rows={5}
                  readOnly={readOnly}
                />
                {!readOnly && outcomeCount < MINIMUM_OUTCOMES && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {outcomeCount} of {MINIMUM_OUTCOMES} learning outcomes so far.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={contentId}>Course content</Label>
                <FieldHelp field="courseContent" value={draft.courseContent} />
                <Textarea
                  id={contentId}
                  value={draft.courseContent}
                  onChange={(event) => setDraft({ ...draft, courseContent: event.target.value })}
                  rows={6}
                  readOnly={readOnly}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={labId}>Lab work (if any)</Label>
                  <Textarea
                    id={labId}
                    value={draft.labWork}
                    onChange={(event) => setDraft({ ...draft, labWork: event.target.value })}
                    rows={3}
                    readOnly={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={entrepreneurialId}>Entrepreneurial aspect (if any)</Label>
                  <Textarea
                    id={entrepreneurialId}
                    value={draft.entrepreneurialAspect}
                    onChange={(event) => setDraft({ ...draft, entrepreneurialAspect: event.target.value })}
                    rows={3}
                    readOnly={readOnly}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                  {readOnly ? "Close" : "Cancel"}
                </Button>
                {!readOnly && (
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Save for every programme
                  </Button>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
