"use client";

/**
 * Task U6: the three-step welcome, shown once (remembered on this device)
 * and again from the Help panel. Skippable at any step.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser } from "@/contexts/user-context";
import { OPEN_WELCOME_EVENT, WELCOME_SEEN_KEY, welcomeTourFor } from "@/lib/help/welcome-tour";

export function openWelcomeTour() {
  window.dispatchEvent(new Event(OPEN_WELCOME_EVENT));
}

const SEEN_EVENT = "abrs:welcome-seen";

function readSeen(userId: string): string {
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY(userId)) ?? "";
  } catch {
    // No storage (a private window): treat it as seen rather than opening every time.
    return "unavailable";
  }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(SEEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SEEN_EVENT, onChange);
  };
};

export function WelcomeTour() {
  const { currentUser } = useUser();
  const steps = welcomeTourFor(currentUser?.role);
  const userId = currentUser?.id ?? "";
  // Seen on this device? The server never opens it (no storage there).
  const seen = useSyncExternalStore(subscribe, () => (userId ? readSeen(userId) : "unavailable"), () => "server");
  const [reopened, setReopened] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reopen = () => {
      setStep(0);
      setReopened(true);
    };
    window.addEventListener(OPEN_WELCOME_EVENT, reopen);
    return () => window.removeEventListener(OPEN_WELCOME_EVENT, reopen);
  }, []);

  const open = Boolean(steps) && (reopened || seen === "");
  if (!currentUser || !steps) return null;
  const close = () => {
    try {
      window.localStorage.setItem(WELCOME_SEEN_KEY(currentUser.id), new Date().toISOString());
    } catch {
      // Nothing to remember it in.
    }
    setReopened(false);
    window.dispatchEvent(new Event(SEEN_EVENT));
  };
  const current = steps[step];
  const last = step === steps.length - 1;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <p className="text-xs font-medium text-muted-foreground">
            Welcome, {currentUser.firstName} · step {step + 1} of {steps.length}
          </p>
          <DialogTitle>{current.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">{current.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={close}>
            Skip
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button onClick={() => (last ? close() : setStep(step + 1))}>{last ? "Get started" : "Next"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
