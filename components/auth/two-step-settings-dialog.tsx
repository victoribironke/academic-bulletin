"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { RecoveryCodes } from "@/components/auth/recovery-codes";
import { formatDate } from "@/lib/dates/format";

type Status = { enabledAt: string | null; recoveryCodesLeft: number };


/**
 * An admin's own two-step verification: when it was set up, how many
 * recovery codes are left, and making new ones (with a current code).
 */
export function TwoStepSettingsDialog({
  open,
  onOpenChange,
  email,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/mfa/status", { headers: { "Cache-Control": "no-cache" } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data: Status) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = (value: boolean) => {
    onOpenChange(value);
    if (!value) {
      setStatus(null);
      setLoadError(false);
      setCode("");
      setError(null);
      setNewCodes(null);
    }
  };

  const renew = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/mfa/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setNewCodes(data.recoveryCodes);
        setCode("");
      } else {
        setError(data.error ?? "Couldn't make new recovery codes. Please try again.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Two-step verification</DialogTitle>
          <DialogDescription>
            You enter a code from your authenticator app each time you sign in.
          </DialogDescription>
        </DialogHeader>

        {newCodes ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Save these new recovery codes somewhere safe. Your old codes no
              longer work, and you won&apos;t see these again.
            </p>
            <RecoveryCodes codes={newCodes} account={email} />
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">
            Couldn&apos;t load your two-step verification. Close this and try again.
          </p>
        ) : !status ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={renew} className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-md border bg-muted/40 p-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Set up</dt>
                <dd className="font-medium">
                  {status.enabledAt ? formatDate(status.enabledAt) : "Not yet"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Recovery codes left</dt>
                <dd
                  className={
                    status.recoveryCodesLeft <= 2 ? "font-medium text-destructive" : "font-medium"
                  }
                >
                  {status.recoveryCodesLeft} of 10
                </dd>
              </div>
            </dl>

            <div className="space-y-2">
              <Label htmlFor="renew-code">Make new recovery codes</Label>
              <p className="text-xs text-muted-foreground">
                Enter the current code from your authenticator app. Your old
                recovery codes stop working.
              </p>
              <Input
                id="renew-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, ""))}
                placeholder="123456"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                className="font-mono tracking-[0.3em]"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Lost or replaced your phone? Another Super Administrator can reset
              your two-step verification from the Users page, and you set up the
              new phone at your next sign-in.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Close
              </Button>
              <Button type="submit" disabled={busy || !code.trim()}>
                {busy && <Loader2 className="animate-spin" />}
                Make new codes
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
