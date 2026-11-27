"use client";

/**
 * Tasks E4 and Q4: the Dean's or Head of Department's title and full name,
 * kept once on the school or department and printed under their photo on
 * every programme there. Saves when you leave a box.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEADER_ROLE_LABEL, LEADER_TITLES, MAX_LEADER_NAME, MAX_LEADER_TITLE, type Leader, type LeaderRole, type Leaders, leaderName } from "@/lib/leaders";
import { TRY_AGAIN } from "@/lib/messages";

export function LeaderDetails({
  submissionId,
  role,
  leader,
  place,
  canEdit,
  onSaved,
}: {
  submissionId: string;
  role: LeaderRole;
  leader: Leader;
  /** "School of Computing" or "Department of Economics": where the record is kept. */
  place: string;
  canEdit: boolean;
  onSaved: (leaders: Leaders) => void;
}) {
  // The page remounts this (key) when the saved record changes.
  const [title, setTitle] = useState(leader.title ?? "");
  const [name, setName] = useState(leader.name ?? "");

  const save = async (field: "title" | "name", value: string) => {
    if ((leader[field] ?? "") === value.trim()) return;
    const res = await fetch(`/api/submissions/${submissionId}/leaders`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, [field]: value }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      toast.error(`Couldn't save the ${LEADER_ROLE_LABEL[role]}'s ${field}`, { description: body.error ?? TRY_AGAIN });
      return;
    }
    onSaved(body.leaders);
    toast.success(`Saved for every programme in ${place}`);
  };

  const listId = `${submissionId}-${role}-titles`;
  const printed = leaderName({ ...leader, title: title || null, name: name || null });
  return (
    <div className="space-y-2">
      {canEdit ? (
        <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
          <div className="space-y-1">
            <Label htmlFor={`${submissionId}-${role}-title`} className="text-xs">
              Title
            </Label>
            <Input
              id={`${submissionId}-${role}-title`}
              value={title}
              maxLength={MAX_LEADER_TITLE}
              list={listId}
              placeholder="Prof."
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void save("title", title)}
            />
            <datalist id={listId}>
              {LEADER_TITLES.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${submissionId}-${role}-name`} className="text-xs">
              Full name
            </Label>
            <Input
              id={`${submissionId}-${role}-name`}
              value={name}
              maxLength={MAX_LEADER_NAME}
              placeholder="As it should print in the bulletin"
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void save("name", name)}
            />
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {printed ? (
          <>
            Printed under the photo: <span className="font-medium text-foreground">{printed}</span>, {LEADER_ROLE_LABEL[role]}.{" "}
          </>
        ) : (
          `Add the ${LEADER_ROLE_LABEL[role]}'s title and full name; they print under the photo. `
        )}
        Kept once for every programme in {place}.
      </p>
    </div>
  );
}
