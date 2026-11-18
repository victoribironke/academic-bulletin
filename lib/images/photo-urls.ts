import { fileKeyFromUrl } from "@/lib/storage";

/**
 * A bulletin's dean and HOD photos are addresses saved inside its programme
 * info. Only photos uploaded to the app (/api/files/...) may be saved there:
 * any other address would be loaded by every reader's browser, and the Word
 * and PDF exports would have the server fetch it.
 */

export const PROGRAMME_PHOTO_FIELDS = {
  deanImageUrl: "dean's photo",
  hodImageUrl: "HOD's photo",
} as const;

function readField(info: unknown, name: string): unknown {
  if (!info || typeof info !== "object" || Array.isArray(info)) return undefined;
  return (info as Record<string, unknown>)[name];
}

/**
 * Names the first photo in `next` that wasn't uploaded to the app, or null.
 * A value that is already saved (`current`) passes unchanged, so an older
 * record can still be saved; such a photo just isn't shown or exported.
 */
export function photoNotUploadedHere(next: unknown, current: unknown): string | null {
  for (const [name, label] of Object.entries(PROGRAMME_PHOTO_FIELDS)) {
    const value = readField(next, name);
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "string" && fileKeyFromUrl(value)) continue;
    if (value === readField(current, name)) continue;
    return label;
  }
  return null;
}
