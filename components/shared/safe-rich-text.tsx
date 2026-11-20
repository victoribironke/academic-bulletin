"use client";

import { useMemo, useSyncExternalStore } from "react";
import { cleanText } from "@/lib/bulletin/document-utils";
import { sanitizeRichText } from "@/lib/html/safe-html";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

/**
 * Shows stored rich text with only the editor's formatting kept. The server
 * render shows the plain words (React escapes them); the browser then swaps
 * in the cleaned formatting. Never put stored HTML on the page any other way.
 */
export function SafeRichText({
  html,
  className,
  emptyText,
}: {
  html: string | null | undefined;
  className?: string;
  emptyText?: string;
}) {
  const inBrowser = useSyncExternalStore(subscribe, () => true, () => false);
  const clean = useMemo(
    () => (inBrowser ? sanitizeRichText(html) : null),
    [inBrowser, html],
  );

  if (!html?.trim() && emptyText) {
    return <div className={className}><p>{emptyText}</p></div>;
  }
  if (clean === null) {
    return <div className={cn(className, "whitespace-pre-line")}>{cleanText(html ?? "")}</div>;
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
