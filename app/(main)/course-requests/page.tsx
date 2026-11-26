"use client";

/**
 * DAP's queue of course change requests from Heads of Department (task B10):
 * every request, its programme and status. DAP marks each one done or
 * declined (with a reply the Head sees on the draft), or reopens it.
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/dates/format";
import { TRY_AGAIN } from "@/lib/messages";

const KINDS: Record<string, string> = {
  ADD: "Add a course",
  REMOVE: "Remove a course",
  UNITS: "Change the units",
  SEMESTER: "Change the semester",
  OTHER: "Something else",
};
const STATUS_LABELS: Record<string, string> = { OPEN: "Open", DONE: "Done", DECLINED: "Declined" };

type Request = {
  id: string;
  kind: string;
  courseCode: string | null;
  details: string;
  status: string;
  response: string | null;
  requestedAt: string;
  requestedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  submissionId: string;
  programme: string;
  programmeCode: string;
  department: string;
};

export default function CourseRequestsPage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const allowed = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const [filter, setFilter] = useState<"OPEN" | "ALL">("OPEN");
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [answering, setAnswering] = useState<{ request: Request; status: "DONE" | "DECLINED" } | null>(null);
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const responseId = useId();

  useEffect(() => {
    if (!userLoading && !allowed) router.push("/dashboard");
  }, [userLoading, allowed, router]);

  useEffect(() => {
    if (userLoading || !allowed) return;
    let cancelled = false;
    fetch(`/api/course-change-requests${filter === "OPEN" ? "?status=OPEN" : ""}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setRequests(data);
          setFailed(null);
        } else {
          setFailed(data.error ?? "Couldn't load the requests.");
        }
      })
      .catch(() => {
        if (!cancelled) setFailed("Couldn't load the requests.");
      });
    return () => {
      cancelled = true;
    };
  }, [userLoading, allowed, filter, reloadKey]);

  const update = async (request: Request, status: "OPEN" | "DONE" | "DECLINED", reply: string | null) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/course-change-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, response: reply }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(status === "OPEN" ? "Reopened." : `Marked ${STATUS_LABELS[status].toLowerCase()}.`);
        setAnswering(null);
        setResponse("");
        setReloadKey((key) => key + 1);
      } else {
        toast.error("Couldn't update the request", { description: data.error ?? TRY_AGAIN });
      }
    } finally {
      setSaving(false);
    }
  };

  if (!userLoading && !allowed) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Course change requests"
        description="Heads of Department ask here for changes to their course lists: a course added or removed, or its units or semester changed. Make the change in the Registry or the draft, then mark the request done; the Head sees your answer on the draft."
      />

      <Tabs value={filter} onValueChange={(value) => setFilter(value as "OPEN" | "ALL")}>
        <TabsList>
          <TabsTrigger value="OPEN">Open</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {failed ? (
        <ErrorState title={failed} onRetry={() => setReloadKey((key) => key + 1)} />
      ) : !requests ? (
        <TableSkeleton columns={4} rows={3} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filter === "OPEN" ? "No open requests" : "No requests yet"}
          description="Requests from Heads of Department appear here."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead scope="col">Request</TableHead>
                <TableHead scope="col" className="hidden md:table-cell">
                  Programme
                </TableHead>
                <TableHead scope="col" className="hidden sm:table-cell">
                  Asked by
                </TableHead>
                <TableHead scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="max-w-md align-top">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={request.status === "OPEN" ? "outline" : request.status === "DONE" ? "secondary" : "destructive"}>
                        {STATUS_LABELS[request.status] ?? request.status}
                      </Badge>
                      <span className="font-medium">
                        {KINDS[request.kind] ?? request.kind}
                        {request.courseCode ? `: ${request.courseCode}` : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{request.details}</p>
                    {request.response && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Answer{request.resolvedBy ? ` (${request.resolvedBy})` : ""}: {request.response}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground md:hidden">{request.programme}</p>
                  </TableCell>
                  <TableCell className="hidden align-top md:table-cell">
                    <Link href={`/submissions/${request.submissionId}?section=courses`} className="font-medium underline-offset-4 hover:underline">
                      {request.programme}
                    </Link>
                    <p className="text-xs text-muted-foreground">{request.department}</p>
                  </TableCell>
                  <TableCell className="hidden align-top text-sm text-muted-foreground sm:table-cell">
                    {request.requestedBy ?? "Unknown"}
                    <br />
                    {formatDateTime(request.requestedAt)}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <div className="flex flex-wrap justify-end gap-2">
                      {request.status === "OPEN" ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setAnswering({ request, status: "DONE" })}>
                            Mark done
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setAnswering({ request, status: "DECLINED" })}>
                            Decline
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => void update(request, "OPEN", request.response)} disabled={saving}>
                          Reopen
                        </Button>
                      )}
                    </div>
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
                void update(answering.request, answering.status, response.trim() || null);
              }}
            >
              <DialogHeader>
                <DialogTitle>{answering.status === "DONE" ? "Mark the request done" : "Decline the request"}</DialogTitle>
                <DialogDescription>
                  {answering.request.programme}: {KINDS[answering.request.kind] ?? answering.request.kind}
                  {answering.request.courseCode ? ` (${answering.request.courseCode})` : ""}. The Head of
                  Department sees your answer on the draft.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor={responseId}>
                  {answering.status === "DONE" ? "Answer (optional)" : "Why it was declined"}
                </Label>
                <Textarea id={responseId} value={response} onChange={(event) => setResponse(event.target.value)} rows={3} maxLength={1000} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAnswering(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || (answering.status === "DECLINED" && !response.trim())}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {answering.status === "DONE" ? "Mark done" : "Decline"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
