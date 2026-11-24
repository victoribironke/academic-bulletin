"use client";

/**
 * Task G1: "Continue where I stopped". The draft page remembers, in this
 * browser only, the last draft and section the person opened; the home page
 * offers to go straight back there.
 */
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type LastPlace = {
  submissionId: string;
  programme: string;
  section: string;
  sectionTitle: string;
  at: string;
};

const keyFor = (userId: string) => `abrs-last-place:${userId}`;

/** Called by the draft page whenever a section is opened. */
export function rememberLastPlace(userId: string, place: LastPlace) {
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(place));
  } catch {
    // Private windows and blocked storage: nothing to remember.
  }
}

function readLastPlace(userId: string): string {
  try {
    return window.localStorage.getItem(keyFor(userId)) ?? "";
  } catch {
    return "";
  }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

export function ContinueWhereStopped({ userId }: { userId: string }) {
  const stored = useSyncExternalStore(subscribe, () => readLastPlace(userId), () => "");
  let place: LastPlace | null = null;
  try {
    place = stored ? (JSON.parse(stored) as LastPlace) : null;
  } catch {
    place = null;
  }
  if (!place?.submissionId || !place.section) return null;
  return (
    <Button asChild variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left">
      <Link href={`/submissions/${place.submissionId}?section=${encodeURIComponent(place.section)}`}>
        <span>
          Continue where you stopped: <span className="font-semibold">{place.programme}</span>, {place.sectionTitle}
        </span>
        <ArrowRight className="ml-1 shrink-0" />
      </Link>
    </Button>
  );
}
