"use client";

/**
 * "What is waiting on you" on the My desk panel (work order task T1): the
 * desk's own waiting work, most urgent first, each line opening the right
 * screen, with "Do this next" for the first.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

type WaitingItem = {
  key: string;
  kind: string;
  programme: string;
  text: string;
  href: string;
  since: string | null;
  waited: string | null;
};

const SHOWN = 6;

export function WaitingWork() {
  const [items, setItems] = useState<WaitingItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/desk/waiting")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items: WaitingItem[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) return null;
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
        <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        Nothing is waiting on you right now.
      </div>
    );
  }
  const [next] = items;
  return (
    <section aria-labelledby="waiting-on-you" className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <h2 id="waiting-on-you" className="text-sm font-medium">
          What is waiting on you ({items.length})
        </h2>
        <Button asChild size="sm">
          <Link href={next.href}>
            Do this next
            <ArrowRight />
          </Link>
        </Button>
      </div>
      <ul className="divide-y">
        {items.slice(0, SHOWN).map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm hover:bg-muted/50">
              <span className="min-w-0">
                <span className="font-medium text-foreground">{item.programme}</span>
                <span className="block text-muted-foreground">{item.text}</span>
              </span>
              {item.waited && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.waited}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground">
          And {items.length - SHOWN} more. They open from the programmes below or from Submissions.
        </p>
      )}
    </section>
  );
}
