"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Lets a Super Admin reset someone else's two-step verification (a lost or
 * replaced phone), after typing their email address.
 */
export function ResetTwoStepDialog({
  user,
  onSuccess,
}: {
  user: { id: string; firstName: string; lastName: string; email: string };
  onSuccess?: () => void;
}) {
  const name = `${user.firstName} ${user.lastName}`;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const matches = normalize(typed) !== "" && normalize(typed) === normalize(user.email);

  const reset = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${user.id}/mfa`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Two-step verification couldn't be reset.");
        return;
      }
      toast.success(`${name}'s two-step verification was reset.`);
      setOpen(false);
      onSuccess?.();
    } catch {
      toast.error("Two-step verification couldn't be reset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (isOpen) setTyped("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Reset two-step verification for ${name}`}>
          <ShieldOff />
          <span className="hidden sm:inline">Reset two-step</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Reset two-step verification</DialogTitle>
          <DialogDescription>
            Do this only when {name} has lost or replaced their phone and has no
            recovery codes left. Their authenticator app and recovery codes stop
            working, they&apos;re signed out of admin work straight away, and at
            their next sign-in they set up the app again. They get an email
            about it, and the reset is recorded in the Activity Log.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (matches) void reset();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`reset-two-step-${user.id}`}>
              Type <span className="font-mono">{user.email}</span> to confirm
            </Label>
            <Input
              id={`reset-two-step-${user.id}`}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!matches || busy}>
              {busy && <Loader2 className="animate-spin" />}
              Reset two-step verification
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
