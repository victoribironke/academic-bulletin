"use client";

/**
 * Task G2 (programme coordinators, R1): the Head of Department names a
 * programme coordinator for any of the department's programmes, mainly the
 * new ones. The coordinator edits the whole programme; only the Head submits
 * it. Taking someone off a programme removes nothing they wrote; it asks
 * for DELETE to be typed, like every removal (Q7).
 */
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus, UsersRound, X } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { TableCard } from "@/components/shared/table-toolbar";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/states";
import { DELETE_WORD, useConfirmDelete } from "@/components/shared/typed-delete-dialog";
import { Button } from "@/components/ui/button";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/dates/format";
import type { DepartmentCoordinators } from "@/lib/people/coordinators";

type Form = { firstName: string; lastName: string; email: string; programmeIds: string[] };

const blank = (programmeIds: string[] = []): Form => ({ firstName: "", lastName: "", email: "", programmeIds });

export default function CoordinatorsPage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const allowed = currentUser?.role === "HOD";
  const [data, setData] = useState<DepartmentCoordinators | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const { confirmDelete, dialog: deleteDialog } = useConfirmDelete();
  const formId = useId();

  useEffect(() => {
    if (!userLoading && !allowed) router.push("/dashboard");
  }, [userLoading, allowed, router]);

  useEffect(() => {
    if (userLoading || !allowed) return;
    let cancelled = false;
    fetch("/api/coordinators")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setData(body);
          setFailed(null);
        } else setFailed(body.error ?? "Couldn't load your programmes.");
      })
      .catch(() => {
        if (!cancelled) setFailed("Couldn't load your programmes.");
      });
    return () => {
      cancelled = true;
    };
  }, [userLoading, allowed, reloadKey]);

  const name = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch("/api/coordinators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't name the coordinator", { description: body.error ?? "Please try again." });
        return;
      }
      setData(body.coordinators);
      setForm(null);
      const invitation = body.invitation as { sent: boolean; reason?: string } | null;
      toast.success(`${body.name} can now draft ${body.programmes.join(" and ")}.`, {
        description: invitation
          ? invitation.sent
            ? `An invitation went to ${form.email.trim().toLowerCase()}.`
            : `The invitation wasn't sent: ${invitation.reason ?? "please tell them yourself"}`
          : "They already have an account; the programme is on their list when they next sign in.",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (person: { id: string; name: string }, programme: { id: string; name: string }, lastOne: boolean) => {
    const confirmed = await confirmDelete({
      title: `Take ${person.name} off ${programme.name}?`,
      description: `Nothing they wrote is removed, and you can name them again later.${lastOne ? " It's their only programme, so their account is switched off until then." : ""}`,
      actionLabel: "Take them off",
    });
    if (!confirmed) return;
    const res = await fetch(`/api/coordinators/${encodeURIComponent(person.id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programmeId: programme.id, confirm: DELETE_WORD }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't take them off", { description: body.error ?? "Please try again." });
      return;
    }
    setData(body.coordinators);
    toast.success(
      body.switchedOff
        ? `${body.name} no longer coordinates ${body.programme}, and their account is switched off.`
        : `${body.name} no longer coordinates ${body.programme}.`,
    );
  };

  if (!userLoading && !allowed) return null;
  if (failed) return <ErrorState title={failed} onRetry={() => setReloadKey((key) => key + 1)} />;
  if (!data) return <TableSkeleton columns={3} rows={5} />;

  const programmesOf = (userId: string) => data.programmes.filter((programme) => programme.coordinators.some((person) => person.id === userId)).length;
  const formReady =
    form !== null && form.firstName.trim() !== "" && form.lastName.trim() !== "" && form.email.trim() !== "" && form.programmeIds.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Programme coordinators"
        description={
          <>
            A coordinator drafts a whole programme for you: every section, the course list and the course descriptions.
            Only you submit it to the School. They sign in with their babcock.edu.ng Google account and an authenticator
            app, as you do.
          </>
        }
        actions={
          data.programmes.length > 0 && (
            <Button onClick={() => setForm(blank())}>
              <UserPlus /> Name a coordinator
            </Button>
          )
        }
      />

      {data.programmes.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No programmes yet"
          description={`${data.department.name} has no programmes on the platform yet. When DAP adds them, you can name a coordinator for each one here.`}
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Programme</TableHead>
                <TableHead>Coordinators</TableHead>
                <TableHead className="w-0 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.programmes.map((programme) => (
                <TableRow key={programme.id}>
                  <TableCell className="align-top">
                    <p className="font-medium">
                      {programme.name}
                      {programme.isNew && (
                        <span className="ml-2 rounded border border-brand-gold/50 bg-brand-gold/10 px-1.5 py-0.5 text-[11px] font-medium">
                          New programme
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{programme.code}</p>
                  </TableCell>
                  <TableCell className="align-top">
                    {programme.coordinators.length === 0 ? (
                      <span className="text-sm text-muted-foreground">You draft this one yourself.</span>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {programme.coordinators.map((person) => (
                          <li key={person.id} className="flex items-center gap-2">
                            <span className="min-w-0">
                              <span className="font-medium">{person.name}</span>{" "}
                              <span className="text-muted-foreground">
                                {person.email} ·{" "}
                                {person.signedIn
                                  ? "has signed in"
                                  : person.invitedAt
                                    ? `invited ${formatDate(person.invitedAt)}`
                                    : "not invited yet"}
                              </span>
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              aria-label={`Take ${person.name} off ${programme.name}`}
                              onClick={() => void remove(person, programme, programmesOf(person.id) === 1)}
                            >
                              <X />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell className="text-right align-top">
                    <Button variant="outline" size="sm" onClick={() => setForm(blank([programme.id]))}>
                      <UserPlus /> Name one
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <Dialog open={form !== null} onOpenChange={(open) => !saving && !open && setForm(null)}>
        <DialogContent>
          {form && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void name();
              }}
            >
              <DialogHeader>
                <DialogTitle>Name a programme coordinator</DialogTitle>
                <DialogDescription>
                  They can edit every section of the programmes you choose. Only you can submit them. New coordinators get an
                  invitation by email.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-first`}>First name</Label>
                  <Input
                    id={`${formId}-first`}
                    required
                    maxLength={60}
                    value={form.firstName}
                    onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${formId}-last`}>Last name</Label>
                  <Input
                    id={`${formId}-last`}
                    required
                    maxLength={60}
                    value={form.lastName}
                    onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`${formId}-email`}>babcock.edu.ng email</Label>
                  <Input
                    id={`${formId}-email`}
                    type="email"
                    required
                    placeholder="name@babcock.edu.ng"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                  />
                </div>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Programmes they draft</legend>
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                  {data.programmes.map((programme) => (
                    <label key={programme.id} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={form.programmeIds.includes(programme.id)}
                        onCheckedChange={(state) =>
                          setForm({
                            ...form,
                            programmeIds:
                              state === true
                                ? [...form.programmeIds, programme.id]
                                : form.programmeIds.filter((id) => id !== programme.id),
                          })
                        }
                      />
                      <span>
                        {programme.name}
                        {programme.isNew && <span className="ml-1 text-xs text-muted-foreground">(new)</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || !formReady}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Name coordinator
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
