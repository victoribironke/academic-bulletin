"use client";

/**
 * Task G2: the Head of Department adds lecturers (who see only the courses
 * the Head gives them) and committee members (who read and comment on the
 * programmes named for them). Each is invited at their babcock.edu.ng
 * address; taking someone off asks for DELETE to be typed (Q7).
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus, X } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, TableSkeleton } from "@/components/shared/states";
import { DELETE_WORD, useConfirmDelete } from "@/components/shared/typed-delete-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DepartmentCoordinators } from "@/lib/people/coordinators";
import { TRY_AGAIN } from "@/lib/messages";

type Lecturer = { id: string; name: string; email: string; invitedAt: string | null; signedIn: boolean; courses: number };
type Person = { firstName: string; lastName: string; email: string };
const blankPerson = (): Person => ({ firstName: "", lastName: "", email: "" });

function invitationNote(invitation: { sent: boolean; reason?: string } | null, email: string) {
  return invitation
    ? invitation.sent
      ? `An invitation went to ${email}.`
      : `The invitation wasn't sent: ${invitation.reason ?? "please tell them yourself"}`
    : "They already have an account.";
}

function PersonFields({ prefix, value, onChange }: { prefix: string; value: Person; onChange: (value: Person) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-first`} className="text-xs">
          First name
        </Label>
        <Input id={`${prefix}-first`} value={value.firstName} maxLength={60} onChange={(event) => onChange({ ...value, firstName: event.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-last`} className="text-xs">
          Last name
        </Label>
        <Input id={`${prefix}-last`} value={value.lastName} maxLength={60} onChange={(event) => onChange({ ...value, lastName: event.target.value })} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${prefix}-email`} className="text-xs">
          babcock.edu.ng email
        </Label>
        <Input id={`${prefix}-email`} type="email" value={value.email} onChange={(event) => onChange({ ...value, email: event.target.value })} />
      </div>
    </div>
  );
}

export default function LecturersPage() {
  const router = useRouter();
  const { currentUser, isLoading: userLoading } = useUser();
  const allowed = currentUser?.role === "HOD";
  const [lecturers, setLecturers] = useState<Lecturer[] | null>(null);
  const [committee, setCommittee] = useState<DepartmentCoordinators | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [lecturer, setLecturer] = useState<Person>(blankPerson);
  const [member, setMember] = useState<Person>(blankPerson);
  const [memberProgrammes, setMemberProgrammes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirmDelete, dialog } = useConfirmDelete();

  useEffect(() => {
    if (!userLoading && !allowed) router.push("/dashboard");
  }, [userLoading, allowed, router]);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([fetch("/api/lecturers").catch(() => null), fetch("/api/committee").catch(() => null)]);
    if (!a?.ok || !b?.ok) {
      setFailed("Couldn't load your lecturers and committee.");
      return;
    }
    setFailed(null);
    setLecturers((await a.json()).lecturers);
    setCommittee(await b.json());
  }, []);
  useEffect(() => {
    if (userLoading || !allowed) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [userLoading, allowed, load]);

  const call = async (key: string, url: string, init: RequestInit, failure: string) => {
    setBusy(key);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(failure, { description: body.error ?? TRY_AGAIN });
        return null;
      }
      return body;
    } finally {
      setBusy(null);
    }
  };

  const addLecturer = async () => {
    const body = await call("lecturer", "/api/lecturers", { method: "POST", body: JSON.stringify(lecturer) }, "Couldn't add the lecturer");
    if (!body) return;
    setLecturers(body.lecturers);
    toast.success(`${body.name} is one of your lecturers.`, { description: invitationNote(body.invitation, lecturer.email.trim().toLowerCase()) });
    setLecturer(blankPerson());
  };

  const removeLecturer = async (person: Lecturer) => {
    const confirmed = await confirmDelete({
      title: `Take ${person.name} off as a lecturer?`,
      description: `Their account is switched off and their ${person.courses} course${person.courses === 1 ? "" : "s"} come back to you. What they wrote stays on the courses. You can add them again later.`,
      actionLabel: "Take them off",
    });
    if (!confirmed) return;
    const body = await call(person.id, `/api/lecturers/${encodeURIComponent(person.id)}`, { method: "DELETE", body: JSON.stringify({ confirm: DELETE_WORD }) }, "Couldn't take them off");
    if (body) {
      setLecturers(body.lecturers);
      toast.success(`${body.name} is no longer a lecturer here.`);
    }
  };

  const addMember = async () => {
    const body = await call(
      "member",
      "/api/committee",
      { method: "POST", body: JSON.stringify({ ...member, programmeIds: memberProgrammes }) },
      "Couldn't name the committee member",
    );
    if (!body) return;
    setCommittee(body.committee);
    toast.success(`${body.name} can now read and comment on ${body.programmes.join(" and ")}.`, {
      description: invitationNote(body.invitation, member.email.trim().toLowerCase()),
    });
    setMember(blankPerson());
    setMemberProgrammes([]);
  };

  const removeMember = async (person: { id: string; name: string }, programme: { id: string; name: string }) => {
    const confirmed = await confirmDelete({
      title: `Take ${person.name} off ${programme.name}?`,
      description: "Their comments stay. With no programme left, their account is switched off until you name them again.",
      actionLabel: "Take them off",
    });
    if (!confirmed) return;
    const body = await call(
      `${person.id}-${programme.id}`,
      `/api/committee/${encodeURIComponent(person.id)}`,
      { method: "DELETE", body: JSON.stringify({ programmeId: programme.id, confirm: DELETE_WORD }) },
      "Couldn't take them off",
    );
    if (body) setCommittee(body.committee);
  };

  if (!userLoading && !allowed) return null;
  if (failed) return <ErrorState title={failed} onRetry={() => void load()} />;
  if (!lecturers || !committee) return <TableSkeleton columns={3} rows={5} />;

  const ready = (person: Person) => person.firstName.trim() && person.lastName.trim() && person.email.trim();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lecturers & Committee"
        description="Lecturers write the descriptions of the courses you give them (in Course Details); committee members read and comment on the programmes you name. Only you submit."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lecturers ({lecturers.length})</CardTitle>
          <CardDescription>They see only the courses you give them, in Course Details of each programme.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lecturers.length > 0 && (
            <ul className="divide-y rounded border">
              {lecturers.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
                  <span>
                    <span className="font-medium">{person.name}</span> <span className="text-muted-foreground">{person.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {person.courses} course{person.courses === 1 ? "" : "s"} · {person.signedIn ? "has signed in" : person.invitedAt ? "invited" : "not invited yet"}
                    </span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" disabled={busy === person.id} onClick={() => void removeLecturer(person)}>
                    <X className="size-4" /> Take off
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addLecturer();
            }}
          >
            <PersonFields prefix="lecturer" value={lecturer} onChange={setLecturer} />
            <Button type="submit" size="sm" disabled={!ready(lecturer) || busy === "lecturer"}>
              {busy === "lecturer" ? <Loader2 className="animate-spin" /> : <UserPlus />} Add lecturer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Committee members</CardTitle>
          <CardDescription>They read and comment on the whole programme; they edit nothing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {committee.programmes.map((programme) => (
              <li key={programme.id} className="rounded border p-2 text-sm">
                <p className="font-medium">{programme.name}</p>
                {programme.coordinators.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No committee members.</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {programme.coordinators.map((person) => (
                      <li key={person.id} className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                        {person.name}
                        <button
                          type="button"
                          className="rounded-full p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Take ${person.name} off ${programme.name}`}
                          onClick={() => void removeMember(person, programme)}
                        >
                          <X className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              void addMember();
            }}
          >
            <PersonFields prefix="member" value={member} onChange={setMember} />
            <fieldset className="space-y-1">
              <legend className="text-xs font-medium">Programmes</legend>
              <div className="flex flex-wrap gap-3">
                {committee.programmes.map((programme) => (
                  <Label key={programme.id} className="flex items-center gap-2 text-sm font-normal">
                    <Checkbox
                      checked={memberProgrammes.includes(programme.id)}
                      onCheckedChange={(state) =>
                        setMemberProgrammes((current) => (state === true ? [...current, programme.id] : current.filter((id) => id !== programme.id)))
                      }
                    />
                    {programme.name}
                  </Label>
                ))}
              </div>
            </fieldset>
            <Button type="submit" size="sm" disabled={!ready(member) || memberProgrammes.length === 0 || busy === "member"}>
              {busy === "member" ? <Loader2 className="animate-spin" /> : <UserPlus />} Name committee member
            </Button>
          </form>
        </CardContent>
      </Card>
      {dialog}
    </div>
  );
}
