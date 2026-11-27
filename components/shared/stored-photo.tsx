"use client";

/**
 * Task U4: a photo stored in the app. With "Low data" on, it isn't
 * downloaded: a placeholder offers to show this one photo.
 */
import { useState } from "react";
import { ImageOff } from "lucide-react";
import { useLowData } from "@/components/layout/low-data-toggle";
import { cn } from "@/lib/utils";

export function StoredPhoto({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const lowData = useLowData();
  const [asked, setAsked] = useState(false);
  if (lowData && !asked) {
    return (
      <button
        type="button"
        onClick={() => setAsked(true)}
        className={cn(
          "flex flex-col items-center justify-center gap-1 bg-muted text-[10px] leading-tight text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label={`Show the photo: ${alt}`}
        title="Low data is on. Show this photo"
      >
        <ImageOff className="size-4" aria-hidden="true" />
        <span className="sr-only">Show photo</span>
      </button>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}
