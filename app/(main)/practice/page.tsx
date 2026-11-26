"use client";

/**
 * Task U6: the practice programme. The real draft screen, on a made-up
 * programme kept in this browser only: the practice API answers every
 * request about it, so nothing reaches the server, the activity log, email
 * or anyone's queue. Start again puts it back as it was.
 */
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import SubmissionDetailPage from "@/app/(main)/submissions/[id]/page";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/shared/states";
import { useUser } from "@/contexts/user-context";
import {
  PRACTICE_NOTE_EVENT,
  installPracticeApi,
  practiceApiInstalled,
  resetPractice,
  subscribePracticeApi,
} from "@/lib/practice/practice-api";
import { PRACTICE_IDS } from "@/lib/practice/ids";

const PARAMS = Promise.resolve({ id: PRACTICE_IDS.draft });

export default function PracticePage() {
  const { currentUser } = useUser();
  const ready = useSyncExternalStore(subscribePracticeApi, practiceApiInstalled, () => false);
  // Bumped by Start again, so the draft screen loads the fresh practice.
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    const uninstall = installPracticeApi({
      id: currentUser.id,
      role: currentUser.role,
      firstName: currentUser.firstName ?? "",
      lastName: currentUser.lastName ?? "",
    });
    return uninstall;
  }, [currentUser]);

  useEffect(() => {
    const onNote = (event: Event) => toast.info((event as CustomEvent<string>).detail);
    window.addEventListener(PRACTICE_NOTE_EVENT, onNote);
    return () => window.removeEventListener(PRACTICE_NOTE_EVENT, onNote);
  }, []);

  const startAgain = () => {
    if (!currentUser) return;
    resetPractice(currentUser.id);
    setRound((value) => value + 1);
  };

  return (
    <div className="space-y-4">
      <div
        role="note"
        className="flex flex-col gap-3 rounded-md border border-brand-gold/50 bg-brand-gold/10 p-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex items-start gap-2 text-sm">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong>Practice programme.</strong> Try anything here: write sections, change courses, comment, submit.
            Nothing is recorded or sent to anyone; it stays in this browser until you start again.
          </span>
        </p>
        <Button variant="outline" size="sm" onClick={startAgain} disabled={!ready}>
          <RotateCcw /> Start again
        </Button>
      </div>
      {ready ? (
        <Suspense fallback={<TableSkeleton columns={3} rows={6} />}>
          <SubmissionDetailPage key={round} params={PARAMS} />
        </Suspense>
      ) : (
        <TableSkeleton columns={3} rows={6} />
      )}
    </div>
  );
}
