import {
  optimizePortrait,
  PortraitOptimizationError,
  type OptimizedPortrait,
} from "@/lib/images/optimize-portrait";

/**
 * Checks an uploaded photo before anything costly happens (the AI photo
 * review, storage). The browser's label for a file is only a claim, so the
 * file's own bytes decide what it is, and it must decode as an image.
 */

// Photos are capped at 4MB (set when Vercel rejected bodies over 4.5MB; kept
// on Railway as a sensible size for a staff or programme photo).
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];

// Room for the multipart framing and the other form fields.
const FORM_OVERHEAD_BYTES = 64 * 1024;

export const PHOTO_TOO_LARGE = "File too large. Maximum size is 4MB.";
export const NOT_A_PHOTO = "This file isn't a JPG, PNG or WEBP image.";

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value);
}

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

/** The image format a file's first bytes show, or null for anything else. */
export function detectPhotoType(bytes: Uint8Array): PhotoType | null {
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (hasBytes(bytes, 0, ascii("RIFF")) && hasBytes(bytes, 8, ascii("WEBP"))) {
    return "image/webp";
  }
  return null;
}

/** True when a request says its body is bigger than any photo upload can be. */
export function photoRequestTooLarge(request: Request): boolean {
  const length = Number(request.headers.get("content-length"));
  return Number.isFinite(length) && length > MAX_PHOTO_BYTES + FORM_OVERHEAD_BYTES;
}

export type CheckedPhoto = {
  /** The file as uploaded. */
  bytes: Buffer;
  /** What the bytes are, whatever the file's name or label says. */
  type: PhotoType;
  /** The JPEG that gets stored. */
  optimized: OptimizedPortrait;
};

export type PhotoRefusal = { ok: false; status: 400 | 413; error: string };

/** Accepts only a real JPEG, PNG or WEBP image of 4MB or less. */
export async function checkPhotoUpload(
  file: FormDataEntryValue | null,
): Promise<{ ok: true; photo: CheckedPhoto } | PhotoRefusal> {
  if (!(file instanceof File)) {
    return { ok: false, status: 400, error: "No image file provided" };
  }
  if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      status: 400,
      error: `Invalid file type. Allowed: ${PHOTO_TYPES.join(", ")}`,
    };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, status: 413, error: PHOTO_TOO_LARGE };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_PHOTO_BYTES) {
    return { ok: false, status: 413, error: PHOTO_TOO_LARGE };
  }

  const type = detectPhotoType(bytes);
  if (!type) return { ok: false, status: 400, error: NOT_A_PHOTO };

  // Decoding the whole file proves it's an image and gives the stored copy.
  try {
    return { ok: true, photo: { bytes, type, optimized: await optimizePortrait(bytes) } };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error:
        error instanceof PortraitOptimizationError
          ? error.message
          : "The image could not be optimized.",
    };
  }
}

/** Reads the upload form; null when the body isn't a readable form. */
export async function readUploadForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
