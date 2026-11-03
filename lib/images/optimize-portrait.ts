import sharp from "sharp";

export const MAX_OPTIMIZED_PORTRAIT_BYTES = 400 * 1024;
export const OPTIMIZED_PORTRAIT_CONTENT_TYPE = "image/jpeg";
export const OPTIMIZED_PORTRAIT_EXTENSION = "jpg";

const MAX_INPUT_PIXELS = 50_000_000;

const OPTIMIZATION_PASSES = [
  { width: 900, height: 1200, quality: 82 },
  { width: 900, height: 1200, quality: 72 },
  { width: 750, height: 1000, quality: 68 },
  { width: 600, height: 800, quality: 60 },
  { width: 450, height: 600, quality: 45 },
] as const;

export class PortraitOptimizationError extends Error {
  constructor(message = "The image could not be optimized.") {
    super(message);
    this.name = "PortraitOptimizationError";
  }
}

export type OptimizedPortrait = {
  buffer: Buffer;
  contentType: typeof OPTIMIZED_PORTRAIT_CONTENT_TYPE;
  extension: typeof OPTIMIZED_PORTRAIT_EXTENSION;
  width: number;
  height: number;
  originalBytes: number;
  storedBytes: number;
};

/**
 * Normalizes uploaded portraits before storage. EXIF orientation is applied,
 * metadata is removed, transparent areas are flattened onto white, and the
 * result is a bounded JPEG that is supported by both bulletin export formats.
 */
export async function optimizePortrait(
  source: Buffer,
): Promise<OptimizedPortrait> {
  if (source.length === 0) {
    throw new PortraitOptimizationError("The uploaded image is empty.");
  }

  try {
    for (const pass of OPTIMIZATION_PASSES) {
      const { data, info } = await sharp(source, {
        failOn: "error",
        limitInputPixels: MAX_INPUT_PIXELS,
        sequentialRead: true,
      })
        .rotate()
        .resize({
          width: pass.width,
          height: pass.height,
          fit: "inside",
          withoutEnlargement: true,
        })
        .flatten({ background: "#ffffff" })
        .jpeg({
          quality: pass.quality,
          progressive: true,
          mozjpeg: true,
          chromaSubsampling: "4:2:0",
        })
        .toBuffer({ resolveWithObject: true });

      if (data.length <= MAX_OPTIMIZED_PORTRAIT_BYTES) {
        return {
          buffer: data,
          contentType: OPTIMIZED_PORTRAIT_CONTENT_TYPE,
          extension: OPTIMIZED_PORTRAIT_EXTENSION,
          width: info.width,
          height: info.height,
          originalBytes: source.length,
          storedBytes: data.length,
        };
      }
    }
  } catch (error) {
    if (error instanceof PortraitOptimizationError) throw error;
    throw new PortraitOptimizationError(
      "The uploaded file is not a valid image or is too large to process safely.",
    );
  }

  throw new PortraitOptimizationError(
    "The image could not be reduced to the required storage size.",
  );
}
