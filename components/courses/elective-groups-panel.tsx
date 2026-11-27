"use client";

/**
 * Task W3: a draft's named elective groups. Each says how many units a
 * student chooses from it; the totals count that minimum, not every elective
 * listed. Courses join a group from the "Elective group" column of the
 * Course Structure table.
 */
import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DELETE_WORD, useConfirmDelete } from "@/components/shared/typed-delete-dialog";
import { TRY_AGAIN } from "@/lib/messages";

export type ElectiveGroupView = {
  id: string;
  name: string;
  chooseUnits: number;
  courses: string[];
  offeredUnits: number;
};

export function ElectiveGroupsPanel({
  submissionId,
  groups,
  disabled,
  onChanged,
}: {
  submissionId: string;
  groups: ElectiveGroupView[];
  disabled?: boolean;
  /** Reload the groups (and anything that counts them). */
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [units, setUnits] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { confirmDelete, dialog } = useConfirmDelete();

  const send = async (key: string, url: string, init: RequestInit, failure: string) => {
    setBusy(key);
    try {
      const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(failure, { description: body.error ?? TRY_AGAIN });
        return false;
      }
      onChanged();
      return true;
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    const ok = await send(
      "add",
      `/api/submissions/${submissionId}/elective-groups`,
      { method: "POST", body: JSON.stringify({ name, chooseUnits: Number(units) }) },
      "Couldn't add the group",
    );
    if (ok) {
      setName("");
      setUnits("");
    }
  };

  const changeUnits = (group: ElectiveGroupView, value: string) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number === group.chooseUnits) return;
    void send(
      group.id,
      `/api/submissions/${submissionId}/elective-groups/${group.id}`,
      { method: "PATCH", body: JSON.stringify({ chooseUnits: number }) },
      "Couldn't change the group",
    );
  };

  const remove = async (group: ElectiveGroupView) => {
    const confirmed = await confirmDelete({
      title: `Remove the elective group "${group.name}"?`,
      description:
        group.courses.length > 0
          ? `Its ${group.courses.length} course${group.courses.length === 1 ? "" : "s"} stay in the Course Structure as electives outside any group, and every one of them counts in the totals until it joins another group.`
          : "It has no courses.",
      actionLabel: "Remove group",
    });
    if (!confirmed) return;
    await send(
      group.id,
      `/api/submissions/${submissionId}/elective-groups/${group.id}`,
      { method: "DELETE", body: JSON.stringify({ confirm: DELETE_WORD }) },
      "Couldn't remove the group",
    );
  };

  return (
    <section aria-labelledby={`${submissionId}-elective-groups`} className="space-y-3 rounded-md border p-3">
      <div>
        <h3 id={`${submissionId}-elective-groups`} className="text-sm font-semibold">
          Elective groups
        </h3>
        <p className="text-xs text-muted-foreground">
          Put electives in a named group and say how many units a student chooses from it. The credit totals count that number, not every
          elective listed (rule W3). Choose a course&apos;s group in the &quot;Elective group&quot; column below.
        </p>
      </div>

      {groups.length > 0 && (
        <ul className="space-y-2">
          {groups.map((group) => {
            const short = group.courses.length > 0 && group.offeredUnits < group.chooseUnits;
            return (
              <li key={group.id} className="flex flex-wrap items-center gap-2 rounded border bg-background p-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{group.name}</span>{" "}
                  <span className="text-muted-foreground">
                    {group.courses.length === 0
                      ? "no courses yet"
                      : `${group.courses.join(", ")}: offers ${group.offeredUnits} units`}
                  </span>
                  {short && (
                    <span className="block text-xs text-destructive">
                      It offers fewer units than a student must choose.
                    </span>
                  )}
                </span>
                <Label htmlFor={`${group.id}-units`} className="text-xs text-muted-foreground">
                  Choose
                </Label>
                <Input
                  id={`${group.id}-units`}
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={group.chooseUnits}
                  disabled={disabled || busy === group.id}
                  onBlur={(event) => changeUnits(group, event.target.value)}
                  className="h-8 w-16 text-sm"
                />
                <span className="text-xs text-muted-foreground">units</span>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={busy === group.id}
                    onClick={() => void remove(group)}
                    aria-label={`Remove the elective group ${group.name}`}
                  >
                    {busy === group.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!disabled && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`${submissionId}-group-name`} className="text-xs">
              New group
            </Label>
            <Input
              id={`${submissionId}-group-name`}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. 400 level electives"
              className="h-8 w-56 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${submissionId}-group-units`} className="text-xs">
              Units a student chooses
            </Label>
            <Input
              id={`${submissionId}-group-units`}
              type="number"
              min={1}
              max={60}
              value={units}
              onChange={(event) => setUnits(event.target.value)}
              className="h-8 w-24 text-sm"
            />
          </div>
          <Button type="submit" size="sm" className="h-8" disabled={busy === "add" || !name.trim() || !units}>
            {busy === "add" ? <Loader2 className="animate-spin" /> : <Plus />} Add group
          </Button>
        </form>
      )}
      {dialog}
    </section>
  );
}
