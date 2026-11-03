import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  MAX_OPTIMIZED_PORTRAIT_BYTES,
  optimizePortrait,
  PortraitOptimizationError,
} from "@/lib/images/optimize-portrait";

describe("portrait image optimization", () => {
  it("converts a large portrait to a bounded export-compatible JPEG", async () => {
    const width = 1200;
    const height = 1600;
    const pixels = Buffer.alloc(width * height * 3);
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (index * 31 + Math.floor(index / 11) * 17) % 256;
    }
    const source = await sharp(pixels, {
      raw: { width, height, channels: 3 },
    })
      .png()
      .toBuffer();

    const result = await optimizePortrait(source);
    const metadata = await sharp(result.buffer).metadata();

    expect(result.contentType).toBe("image/jpeg");
    expect(result.extension).toBe("jpg");
    expect(result.storedBytes).toBe(result.buffer.length);
    expect(result.storedBytes).toBeLessThanOrEqual(
      MAX_OPTIMIZED_PORTRAIT_BYTES,
    );
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBeLessThanOrEqual(900);
    expect(metadata.height).toBeLessThanOrEqual(1200);
  });

  it("applies EXIF orientation and removes metadata", async () => {
    const source = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: "#1d4ed8",
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await optimizePortrait(source);
    const metadata = await sharp(result.buffer).metadata();

    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(1200);
    expect(metadata.orientation).toBeUndefined();
  });

  it("does not enlarge smaller images and flattens transparency", async () => {
    const source = await sharp({
      create: {
        width: 300,
        height: 400,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 0.4 },
      },
    })
      .png()
      .toBuffer();

    const result = await optimizePortrait(source);
    const metadata = await sharp(result.buffer).metadata();

    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(400);
    expect(metadata.hasAlpha).toBe(false);
  });

  it("rejects invalid image data", async () => {
    await expect(
      optimizePortrait(Buffer.from("this is not an image")),
    ).rejects.toBeInstanceOf(PortraitOptimizationError);
  });
});
