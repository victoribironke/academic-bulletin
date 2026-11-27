"use client";

/**
 * Task G2: the Head gives courses to lecturers, sees counts by status, and
 * accepts each one the lecturer marks ready, or returns it with a note.
 * A course given out must be accepted before Submit (V20).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TRY_AGAIN } from "@/lib/messages";

type Status = "ASSIGNED" | "READY" | "ACCEPTED" | "RETURNED";
type Data = {
  lecturers: { id: string; name: string; email: string; signedIn: boolean }[];
  courses: {
    id: string;
    code: string;
    title: string;
    level: number;
    assignment: { id: string; status: Status; note: string | null; lecturer: { id: string; name: string } } | null;
  }[];
  counts: Record<Status, number>;
  canEdit: boolean;
};

const STATUS_WORDS: Record<Status, string> = {
  ASSIGNED: "With the lecturer",
  READY: "Ready for you",
  ACCEPTED: "Accepted",
  RETURNED: "Returned to the lecturer",
};
const NOBODY = "none";

export function LecturerAssignments({ submissionId, canDecide }: { submissionId: string; canDecide: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/submissions/${submissionId}/assignments`).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, [submissionId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const send = async (key: string, method: "POST" | "PATCH", body: object, failure: string) => {
    setBusy(key);
    try {
      const res = await fetch(`/api/submissions/${submissionId}/assignments`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(failure, { description: result.error ?? TRY_AGAIN });
        return false;
      }
      setData(result);
      window.dispatchEvent(new CustomEvent("bulletin:section-saved", { detail: { submissionId } }));
      return true;
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;
  const given = data.courses.filter((course) => course.assignment);
  return (
    <section aria-labelledby={`${submissionId}-lecturers`} className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`${submissionId}-lecturers`} className="flex items-center gap-2 text-sm font-semibold">
            <UsersRound className="size-4" aria-hidden="true" /> Lecturers
          </h3>
          <p className="text-xs text-muted-foreground">
            Give a course to a lecturer to write its description and outcomes. They see only their courses and mark each &quot;Ready for my
            Head&quot;; you accept it or return it with a note. Every course given out must be accepted before you submit.
          </p>
        </div>
        {canDecide && (
          <Button asChild variant="outline" size="sm">
            <Link href="/lecturers">Add lecturers</Link>
          </Button>
        )}
      </div>

      <ul className="flex flex-wrap gap-2 text-xs" aria-label="Courses by status">
        {(Object.keys(STATUS_WORDS) as Status[]).map((status) => (
          <li key={status} className="rounded-full border px-2 py-0.5">
            {STATUS_WORDS[status]}: <span className="font-semibold">{data.counts[status]}</span>
          </li>
        ))}
      </ul>

      {data.lecturers.length === 0 && given.length === 0 ? (
        <p className="text-sm text-muted-foreground">Your department has no lecturers on the platform yet.</p>
      ) : (
        <ul className="divide-y rounded border">
          {data.courses.map((course) => {
            const assignment = course.assignment;
            return (
              <li key={course.id} className="space-y-2 p-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{course.code}</span> {course.title}
                    {assignment && <span className="block text-xs text-muted-foreground">{STATUS_WORDS[assignment.status]}</span>}
                  </span>
                  {data.canEdit && (
                    <Select
                      value={assignment?.lecturer.id ?? NOBODY}
                      onValueChange={(value) =>
                        void send(course.id, "POST", { courseId: course.id, lecturerId: value === NOBODY ? null : value }, "Couldn't give the course")
                      }
                      disabled={busy === course.id}
                    >
                      <SelectTrigger className="h-8 w-48" aria-label={`Lecturer for ${course.code}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NOBODY}>You (not given out)</SelectItem>
                        {data.lecturers.map((lecturer) => (
                          <SelectItem key={lecturer.id} value={lecturer.id}>
                            {lecturer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {canDecide && assignment?.status === "READY" && (
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8"
                        disabled={busy === assignment.id}
                        onClick={() => void send(assignment.id, "PATCH", { assignmentId: assignment.id, action: "accept" }, "Couldn't accept it")}
                      >
                        {busy === assignment.id && <Loader2 className="animate-spin" />} Accept
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setReturning(returning === assignment.id ? null : assignment.id)}>
                        Return
                      </Button>
                    </span>
                  )}
                </div>
                {assignment?.status === "RETURNED" && assignment.note && <p className="text-xs text-muted-foreground">Your note: {assignment.note}</p>}
                {assignment && returning === assignment.id && (
                  <div className="space-y-2">
                    <Textarea
                      value={note}
                      maxLength={1000}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="What the lecturer should change"
                      aria-label={`Note to the lecturer about ${course.code}`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={note.trim().length < 10 || busy === assignment.id}
                      onClick={async () => {
                        if (await send(assignment.id, "PATCH", { assignmentId: assignment.id, action: "return", note }, "Couldn't return it")) {
                          setReturning(null);
                          setNote("");
                        }
                      }}
                    >
                      Return to the lecturer
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
