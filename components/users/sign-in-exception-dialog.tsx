"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  lagosDate,
  latestSignInExceptionDate,
  MAX_SIGN_IN_EXCEPTION_DAYS,
  UNIVERSITY_DOMAIN,
} from "@/lib/sign-in-access";
import { formatDate } from "@/lib/dates/format";

export type SignInExceptionUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  signInExceptionUntil?: string | null;
  signInExceptionReason?: string | null;
  signInExceptionGrantedBy?: { firstName: string; lastName: string } | null;
};

const DEFAULT_DAYS = 30;
const MAX_REASON_LENGTH = 300;


/** "December 19, 2026" for an exception's end, in Lagos time. */
export function formatExceptionDate(value: string | Date): string {
  return formatDate(value);
}

export function hasActiveException(user: SignInExceptionUser): boolean {
  return (
    !!user.signInExceptionUntil && new Date(user.signInExceptionUntil) > new Date()
  );
}

/**
 * Lets a Super Admin give a personal Google account a time-boxed sign-in
 * exception, change it, or end it now.
 */
export function SignInExceptionDialog({
  user,
  onSuccess,
}: {
  user: SignInExceptionUser;
  onSuccess?: () => void;
}) {
  const active = hasActiveException(user);
  const name = `${user.firstName} ${user.lastName}`;

  const today = lagosDate(new Date());
  const latest = latestSignInExceptionDate();
  const defaultEnd = () => {
    const current = active ? lagosDate(new Date(user.signInExceptionUntil!)) : null;
    if (current && current <= latest) return current;
    return lagosDate(new Date(Date.now() + DEFAULT_DAYS * 86_400_000));
  };

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState(defaultEnd);
  const [busy, setBusy] = useState<"save" | "end" | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setReason(active ? (user.signInExceptionReason ?? "") : "");
      setUntil(defaultEnd());
    }
  };

  const send = async (method: "PUT" | "DELETE") => {
    setBusy(method === "PUT" ? "save" : "end");
    try {
      const res = await fetch(`/api/users/${user.id}/sign-in-exception`, {
        method,
        ...(method === "PUT" && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, until }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "The sign-in exception couldn't be saved.");
        return;
      }
      toast.success(
        method === "PUT"
          ? `${name} can sign in until ${formatExceptionDate(data.signInExceptionUntil)}.`
          : `${name}'s sign-in exception has ended.`,
      );
      setOpen(false);
      onSuccess?.();
    } catch {
      toast.error("The sign-in exception couldn't be saved.");
    } finally {
      setBusy(null);
    }
  };

  const canSave = reason.trim().length > 0 && until >= today && until <= latest;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Sign-in exception for ${name}`}>
          <CalendarClock />
          <span className="hidden sm:inline">Exception</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Sign-in exception</DialogTitle>
          <DialogDescription>
            {name} uses a personal Google account ({user.email}), not a{" "}
            {UNIVERSITY_DOMAIN} account. It can sign in only until the date set
            here, at most {MAX_SIGN_IN_EXCEPTION_DAYS} days ahead. Each change and
            each sign-in is recorded in the Activity Log.
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-md border bg-muted/40 p-3 text-sm">
          {active ? (
            <>
              Can sign in until{" "}
              <span className="font-medium">
                {formatExceptionDate(user.signInExceptionUntil!)}
              </span>
              {user.signInExceptionGrantedBy &&
                `, given by ${user.signInExceptionGrantedBy.firstName} ${user.signInExceptionGrantedBy.lastName}`}
              .
            </>
          ) : user.signInExceptionUntil ? (
            <>
              The last exception ended on{" "}
              {formatExceptionDate(user.signInExceptionUntil)}. This account can&apos;t
              sign in.
            </>
          ) : (
            "No exception. This account can't sign in."
          )}
        </p>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) void send("PUT");
          }}
        >
          <div className="space-y-2">
            <Label htmlFor={`exception-reason-${user.id}`}>Reason</Label>
            <Textarea
              id={`exception-reason-${user.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={MAX_REASON_LENGTH}
              placeholder="Why this person can't use a babcock.edu.ng account yet"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`exception-until-${user.id}`}>Can sign in until</Label>
            <Input
              id={`exception-until-${user.id}`}
              type="date"
              value={until}
              min={today}
              max={latest}
              onChange={(event) => setUntil(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              The exception lasts to the end of this day. They are signed out
              within 5 minutes of it ending.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {active ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                disabled={busy !== null}
                onClick={() => void send("DELETE")}
              >
                {busy === "end" && <Loader2 className="animate-spin" />}
                End exception now
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave || busy !== null}>
                {busy === "save" && <Loader2 className="animate-spin" />}
                {active ? "Save changes" : "Give exception"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
