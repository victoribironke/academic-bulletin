"use client";

/**
 * Fills a list page's search box from "?q=" (links from search, task K4).
 * Render it inside <Suspense>, as Next.js asks for anything reading the URL.
 */
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function UrlSearchTerm({ onTerm }: { onTerm: (term: string) => void }) {
  const term = useSearchParams().get("q");
  useEffect(() => {
    if (term) onTerm(term);
  }, [term, onTerm]);
  return null;
}
