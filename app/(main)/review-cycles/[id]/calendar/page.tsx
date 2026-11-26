"use client";

/**
 * Task C4: the cycle's calendar for DAP. Change phase dates and checkpoints
 * (with a reason; the people affected are told by email), holidays, quiet
 * periods and quiet hours, the clinics for Heads of Department (task H8),
 * and grant extensions with a reason. Every change is logged. Nothing locks at a deadline (task C6): the desk shows Overdue
 * and an extension moves its date.
 */
import { use, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, TableSkeleton } from "@/components/shared/states";
import { DELETE_WORD, useConfirmDelete } from "@/components/shared/typed-delete-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/dates/format";
import { CLINIC_MINUTES, CLINIC_TITLE, CLINIC_WEEKDAYS, CLINICS_END, WEEKDAY_NAMES } from "@/lib/calendar/clinic-sessions";
import { TRY_AGAIN } from "@/lib/messages";

type Calendar = {
  cycle: { id: string; name: string; isActive: boolean; archived: boolean; dueTime: string };
  quietHours: Record<string, string>;
  phases: { phase: number; name: string; desk: string; opensAt: string | null; dueAt: string | null; anchor: string | null }[];
  checkpoints: { code: string; name: string; phase: number; type: string; dueAt: string }[];
  holidays: { id: string; date: string; name: string }[];
  quietPeriods: { id: string; from: string; to: string; label: string }[];
  clinics: {
    id: string;
    title: string;
    joinUrl: string;
    untilDate: string;
    schedule: string;
    next: { day: string; time: string } | null;
  }[];
  extensions: {
    id: string;
    scope: string;
    target: string;
    phase: number | null;
    newDueAt: string;
    reason: string;
    approvedBy: string | null;
    createdAt: string;
  }[];
  departments: { id: string; name: string; code: string }[];
  programmes: { id: string; name: string; code: string }[];
};

type Editing =
  | { kind: "phase"; phase: number; name: string; opensAt: string; dueAt: string }
  | { kind: "checkpoint"; code: string; name: string; dueAt: string }
  | { kind: "holiday" }
  | { kind: "quiet-period" }
  | { kind: "clinic" }
  | { kind: "extension" };

const day = (key: string | null) => (key ? formatDate(`${key}T12:00:00Z`) : "No date");

export default function CycleCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const allowed = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quiet, setQuiet] = useState<{ weekdays: string; sabbath: string } | null>(null);
  const { confirmDelete, dialog: deleteDialog } = useConfirmDelete();
  const formId = useId();

  useEffect(() => {
    if (!userLoading && !allowed) router.push("/dashboard");
  }, [userLoading, allowed, router]);

  useEffect(() => {
    if (userLoading || !allowed) return;
    let cancelled = false;
    fetch(`/api/cycles/${id}/calendar`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setCalendar(data);
          setFailed(null);
        } else {
          setFailed(data.error ?? "Couldn't load the calendar.");
        }
      })
      .catch(() => {
        if (!cancelled) setFailed("Couldn't load the calendar.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, userLoading, allowed, reloadKey]);

  const open = (next: Editing, values: Record<string, string> = {}) => {
    setEditing(next);
    setForm(values);
    setNotify(true);
  };
  const field = (name: string) => ({
    value: form[name] ?? "",
    onChange: (event: { target: { value: string } }) => setForm((current) => ({ ...current, [name]: event.target.value })),
  });

  const send = async (body: Record<string, unknown>, done: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/cycles/${id}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCalendar(data.calendar);
        setEditing(null);
        toast.success(typeof data.told === "number" && data.told > 0 ? `${done} ${data.told} people were told by email.` : done);
      } else {
        toast.error("Couldn't save the change", { description: data.error ?? TRY_AGAIN });
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind: "holiday" | "quiet" | "clinic" | "extension", itemId: string, title: string, description: string) => {
    const confirmed = await confirmDelete({ title, description, actionLabel: "Remove" });
    if (!confirmed) return;
    const res = await fetch(`/api/cycles/${id}/calendar`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, itemId, confirm: DELETE_WORD }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setCalendar(data.calendar);
      toast.success("Removed. The change is in the activity log.");
    } else {
      toast.error("Couldn't remove it", { description: data.error ?? TRY_AGAIN });
    }
  };

  if (!userLoading && !allowed) return null;
  if (failed) return <ErrorState title={failed} onRetry={() => setReloadKey((key) => key + 1)} />;
  if (!calendar) return <TableSkeleton columns={4} rows={6} />;

  const readOnly = calendar.cycle.archived;
  const quietHours = quiet ?? { weekdays: calendar.quietHours.weekdays ?? "", sabbath: calendar.quietHours.sabbath ?? "" };
  const phaseOptions = calendar.phases.filter((phase) => phase.dueAt);

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/review-cycles">
          <ArrowLeft /> Review cycles
        </Link>
      </Button>
      <PageHeader
        title={`Calendar: ${calendar.cycle.name}`}
        description="Phase dates, checkpoints, holidays, quiet periods, clinics and extensions. Every change is logged; a new date is emailed to the people it affects. Nothing locks at a deadline: the desk shows Overdue, and an extension moves its date."
      />
      {readOnly && <p className="text-sm text-muted-foreground">This cycle is archived, so its calendar can&apos;t change.</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phases</CardTitle>
          <CardDescription>Each phase&apos;s dates. Phases 7 to 9 follow the Senate vote (C7).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead scope="col">Phase</TableHead>
                <TableHead scope="col">Opens</TableHead>
                <TableHead scope="col">Due</TableHead>
                <TableHead scope="col" className="text-right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendar.phases.map((phase) => (
                <TableRow key={phase.phase}>
                  <TableCell>
                    {phase.phase}. {phase.name}
                    {phase.anchor && <Badge variant="outline" className="ml-2">After the Senate vote</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{day(phase.opensAt)}</TableCell>
                  <TableCell>{day(phase.dueAt)}</TableCell>
                  <TableCell className="text-right">
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => open({ kind: "phase", phase: phase.phase, name: phase.name, opensAt: phase.opensAt ?? "", dueAt: phase.dueAt ?? "" }, { opensAt: phase.opensAt ?? "", dueAt: phase.dueAt ?? "" })}
                        aria-label={`Change the dates of ${phase.name}`}
                      >
                        <Pencil /> Change
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checkpoints and milestones</CardTitle>
          <CardDescription>Moving &ldquo;Submissions open&rdquo; also moves when Submit to School switches on (F0).</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {calendar.checkpoints.map((checkpoint) => (
                <TableRow key={checkpoint.code}>
                  <TableCell>
                    <span className="font-medium">{checkpoint.type === "MILESTONE" ? checkpoint.name : `${checkpoint.code}: ${checkpoint.name}`}</span>
                    <span className="ml-2 text-xs text-muted-foreground">Phase {checkpoint.phase}</span>
                  </TableCell>
                  <TableCell>{day(checkpoint.dueAt)}</TableCell>
                  <TableCell className="text-right">
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => open({ kind: "checkpoint", code: checkpoint.code, name: checkpoint.name, dueAt: checkpoint.dueAt }, { dueAt: checkpoint.dueAt })}
                        aria-label={`Move ${checkpoint.name}`}
                      >
                        <Pencil /> Move
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Holidays</CardTitle>
              <CardDescription>Not working days: countdowns and pace skip them.</CardDescription>
            </div>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={() => open({ kind: "holiday" })}>
                <Plus /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {calendar.holidays.map((holiday) => (
                <li key={holiday.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {day(holiday.date)} · {holiday.name}
                  </span>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${holiday.name}`}
                      onClick={() => void remove("holiday", holiday.id, `Remove ${holiday.name}?`, `${day(holiday.date)} becomes a working day again for countdowns and pace. The change is logged.`)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
              {calendar.holidays.length === 0 && <li className="py-2 text-muted-foreground">No holidays yet.</li>}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Quiet periods and hours</CardTitle>
              <CardDescription>No working days and no reminders in a quiet period; no reminders in quiet hours.</CardDescription>
            </div>
            {!readOnly && (
              <Button size="sm" variant="outline" onClick={() => open({ kind: "quiet-period" })}>
                <Plus /> Add
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y text-sm">
              {calendar.quietPeriods.map((period) => (
                <li key={period.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {period.label}: {day(period.from)} to {day(period.to)}
                  </span>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${period.label}`}
                      onClick={() => void remove("quiet", period.id, `Remove ${period.label}?`, "Its days become working days again, and reminders can be sent in them. The change is logged.")}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
              {calendar.quietPeriods.length === 0 && <li className="py-2 text-muted-foreground">No quiet periods yet.</li>}
            </ul>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void send({ action: "quiet-hours", ...quietHours }, "Quiet hours saved.").then(() => setQuiet(null));
              }}
            >
              <div className="space-y-1">
                <Label htmlFor={`${formId}-hours`}>Quiet hours each day</Label>
                <Input
                  id={`${formId}-hours`}
                  value={quietHours.weekdays}
                  placeholder="18:00-08:00"
                  onChange={(event) => setQuiet({ ...quietHours, weekdays: event.target.value })}
                  className="w-36"
                  disabled={readOnly}
                />
              </div>
              <div className="min-w-48 flex-1 space-y-1">
                <Label htmlFor={`${formId}-sabbath`}>Sabbath</Label>
                <Input
                  id={`${formId}-sabbath`}
                  value={quietHours.sabbath}
                  placeholder="Friday 18:00 to Saturday 19:00"
                  onChange={(event) => setQuiet({ ...quietHours, sabbath: event.target.value })}
                  disabled={readOnly}
                />
              </div>
              {!readOnly && quiet && (
                <Button type="submit" size="sm" disabled={saving}>
                  Save
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Clinics</CardTitle>
            <CardDescription>
              Online clinics for Heads of Department, two a week until {day(CLINICS_END)}. Their home page shows the next ones with the joining link; none falls on a holiday or in a quiet period.
            </CardDescription>
          </div>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => open({ kind: "clinic" }, { title: CLINIC_TITLE, weekday: "TUE", startTime: "14:00", minutes: String(CLINIC_MINUTES), untilDate: CLINICS_END })}
            >
              <Plus /> Add
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {calendar.clinics.map((clinic) => (
              <li key={clinic.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-medium">
                    {clinic.schedule} · {clinic.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Until {day(clinic.untilDate)} · {clinic.next ? `Next: ${clinic.next.day}, ${clinic.next.time}` : "No more sessions"} ·{" "}
                    <a href={clinic.joinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
                      Joining link <ExternalLink className="size-3" />
                    </a>
                  </span>
                </span>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${clinic.schedule}`}
                    onClick={() => void remove("clinic", clinic.id, `Remove the clinic ${clinic.schedule.toLowerCase()}?`, "It no longer shows on the Heads' home page. The change is logged.")}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
            {calendar.clinics.length === 0 && <li className="py-2 text-muted-foreground">No clinics yet. Add the two weekly clinics with their joining links.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Extensions</CardTitle>
            <CardDescription>A later due date for one department or programme, with a reason. Its Head and coordinators are told.</CardDescription>
          </div>
          {!readOnly && (
            <Button size="sm" onClick={() => open({ kind: "extension" }, { scope: "DEPARTMENT", phase: "1" })}>
              <Plus /> Grant an extension
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {calendar.extensions.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">No extensions granted.</p>
          ) : (
            <Table>
              <TableBody>
                {calendar.extensions.map((extension) => (
                  <TableRow key={extension.id}>
                    <TableCell>
                      <p className="font-medium">
                        {extension.target}: {calendar.phases.find((phase) => phase.phase === extension.phase)?.name ?? `Phase ${extension.phase}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {extension.reason} · {extension.approvedBy ?? "DAP"}, {formatDate(extension.createdAt)}
                      </p>
                    </TableCell>
                    <TableCell>Due {day(extension.newDueAt)}</TableCell>
                    <TableCell className="text-right">
                      {!readOnly && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove the extension for ${extension.target}`}
                          onClick={() => void remove("extension", extension.id, `Remove the extension for ${extension.target}?`, "Its desk goes back to the phase's own due date. The change is logged.")}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(next) => !saving && !next && setEditing(null)}>
        <DialogContent>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (editing.kind === "phase") void send({ action: "phase", phase: editing.phase, ...form, notify }, "Phase dates changed.");
                if (editing.kind === "checkpoint") void send({ action: "checkpoint", code: editing.code, ...form, notify }, "Date changed.");
                if (editing.kind === "holiday") void send({ action: "holiday", ...form }, "Holiday added.");
                if (editing.kind === "quiet-period") void send({ action: "quiet-period", ...form }, "Quiet period added.");
                if (editing.kind === "clinic") void send({ action: "clinic", ...form }, "Clinic added. Heads of Department see it on their home page.");
                if (editing.kind === "extension") void send({ action: "extension", ...form }, "Extension granted.");
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {editing.kind === "phase"
                    ? `Change the dates of ${editing.name}`
                    : editing.kind === "checkpoint"
                      ? `Move ${editing.name}`
                      : editing.kind === "holiday"
                        ? "Add a holiday"
                        : editing.kind === "quiet-period"
                          ? "Add a quiet period"
                          : editing.kind === "clinic"
                            ? "Add a clinic"
                            : "Grant an extension"}
                </DialogTitle>
                <DialogDescription>
                  {editing.kind === "phase" || editing.kind === "checkpoint"
                    ? "The reason goes in the activity log and to the people affected."
                    : editing.kind === "extension"
                      ? "The department's Head and coordinators are told by email."
                      : editing.kind === "clinic"
                        ? "A weekly slot, West Africa Time. The change is logged; the joining link is not."
                        : "The change is logged."}
                </DialogDescription>
              </DialogHeader>

              {editing.kind === "phase" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-opens`}>Opens</Label>
                    <Input id={`${formId}-opens`} type="date" {...field("opensAt")} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-due`}>Due</Label>
                    <Input id={`${formId}-due`} type="date" required {...field("dueAt")} />
                  </div>
                </div>
              )}
              {editing.kind === "checkpoint" && (
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-cp`}>New date</Label>
                  <Input id={`${formId}-cp`} type="date" required {...field("dueAt")} />
                </div>
              )}
              {editing.kind === "holiday" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-hd`}>Date</Label>
                    <Input id={`${formId}-hd`} type="date" required {...field("date")} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-hn`}>Name</Label>
                    <Input id={`${formId}-hn`} required maxLength={100} {...field("name")} />
                  </div>
                </div>
              )}
              {editing.kind === "quiet-period" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-3">
                    <Label htmlFor={`${formId}-ql`}>Name</Label>
                    <Input id={`${formId}-ql`} required maxLength={100} {...field("label")} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-qf`}>First day</Label>
                    <Input id={`${formId}-qf`} type="date" required {...field("from")} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-qt`}>Last day</Label>
                    <Input id={`${formId}-qt`} type="date" required {...field("to")} />
                  </div>
                </div>
              )}
              {editing.kind === "clinic" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-3">
                    <Label htmlFor={`${formId}-ct`}>Name</Label>
                    <Input id={`${formId}-ct`} required maxLength={100} {...field("title")} />
                  </div>
                  <div className="space-y-1">
                    <Label>Day</Label>
                    <Select value={form.weekday ?? "TUE"} onValueChange={(value) => setForm((current) => ({ ...current, weekday: value }))}>
                      <SelectTrigger aria-label="Day of the week"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CLINIC_WEEKDAYS.map((weekday) => (
                          <SelectItem key={weekday} value={weekday}>
                            {WEEKDAY_NAMES[weekday]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-cs`}>Starts</Label>
                    <Input id={`${formId}-cs`} type="time" required {...field("startTime")} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-cm`}>Minutes</Label>
                    <Input id={`${formId}-cm`} type="number" min={15} max={120} step={5} required {...field("minutes")} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor={`${formId}-cu`}>Joining link</Label>
                    <Input id={`${formId}-cu`} type="url" required placeholder="https://" maxLength={500} {...field("joinUrl")} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-cl`}>Last day</Label>
                    <Input id={`${formId}-cl`} type="date" required {...field("untilDate")} />
                  </div>
                </div>
              )}
              {editing.kind === "extension" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>For</Label>
                    <Select value={form.scope ?? "DEPARTMENT"} onValueChange={(value) => setForm((current) => ({ ...current, scope: value, targetId: "" }))}>
                      <SelectTrigger aria-label="Department or programme"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEPARTMENT">A department</SelectItem>
                        <SelectItem value="PROGRAMME">A programme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>{form.scope === "PROGRAMME" ? "Programme" : "Department"}</Label>
                    <Select value={form.targetId ?? ""} onValueChange={(value) => setForm((current) => ({ ...current, targetId: value }))}>
                      <SelectTrigger aria-label="Which one"><SelectValue placeholder="Choose" /></SelectTrigger>
                      <SelectContent>
                        {(form.scope === "PROGRAMME" ? calendar.programmes : calendar.departments).map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Phase</Label>
                    <Select value={form.phase ?? "1"} onValueChange={(value) => setForm((current) => ({ ...current, phase: value }))}>
                      <SelectTrigger aria-label="Phase"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {phaseOptions.map((phase) => (
                          <SelectItem key={phase.phase} value={String(phase.phase)}>
                            {phase.phase}. {phase.name} (due {day(phase.dueAt)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`${formId}-ext`}>New due date</Label>
                    <Input id={`${formId}-ext`} type="date" required {...field("newDueAt")} />
                  </div>
                </div>
              )}

              {(editing.kind === "phase" || editing.kind === "checkpoint" || editing.kind === "extension") && (
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-reason`}>Reason</Label>
                  <Textarea id={`${formId}-reason`} rows={2} maxLength={500} required {...field("reason")} />
                </div>
              )}
              {(editing.kind === "phase" || editing.kind === "checkpoint") && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={notify} onCheckedChange={(state) => setNotify(state === true)} />
                  Email the people this date affects
                </label>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || (editing.kind === "extension" && !form.targetId)}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      {deleteDialog}
    </div>
  );
}
