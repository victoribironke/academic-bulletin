"use client";

/**
 * Task U2: a calm note while the connection is down. Changes stay on this
 * device and are sent when the connection returns.
 */
import { WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/use-online";

export const OFFLINE_MESSAGE = "You're offline. Your changes are kept on this device and will be sent when you're back online.";

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="mb-4 flex items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      {OFFLINE_MESSAGE}
    </div>
  );
}
