"use client";

/**
 * Task U1: a page that breaks shows plain words and a way back, never the
 * framework's "Application error" text. The error itself goes to the log.
 */
import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";
import { OUR_SIDE } from "@/lib/messages";

export default function MainError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Page error", error.digest ?? "", error);
  }, [error]);
  return (
    <ErrorState
      title="This page couldn't be shown"
      description={`${OUR_SIDE} If it keeps happening, tell Academic Planning through Ask DAP.`}
      onRetry={reset}
    />
  );
}
