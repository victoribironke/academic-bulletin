"use client";

/**
 * Task U4: a "Low data" switch for slow or costly connections. While it is
 * on, photos (staff, Deans and Heads) aren't downloaded on this device
 * (components/shared/stored-photo.tsx); each can still be shown on request.
 * Remembered on this device only.
 */
import { useSyncExternalStore } from "react";
import { ImageOff, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const KEY = "abrs-low-data";
const EVENT = "abrs:low-data";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLowData(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

export function LowDataToggle() {
  const on = useLowData();
  const toggle = () => {
    try {
      localStorage.setItem(KEY, on ? "off" : "on");
    } catch {
      /* not remembered, but still applied below */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  const label = on ? "Low data is on: photos are hidden. Show photos" : "Low data: hide photos on this device";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-8" aria-pressed={on} aria-label={label} onClick={toggle}>
          {on ? <ImageOff className="size-4" /> : <ImageIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
