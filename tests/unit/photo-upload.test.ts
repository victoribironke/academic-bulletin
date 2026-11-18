import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkPhotoUpload,
  detectPhotoType,
  MAX_PHOTO_BYTES,
  NOT_A_PHOTO,
  photoRequestTooLarge,
} from "@/lib/images/photo-upload";
import { photoNotUploadedHere } from "@/lib/images/photo-urls";
import { loadPhoto } from "@/lib/storage";

const tinyImage = (format: "png" | "jpeg" | "webp") =>
  sharp({ create: { width: 12, height: 16, channels: 3, background: "#336699" } })
    .toFormat(format)
    .toBuffer();

describe("photo upload checks", () => {
  it("tells JPEG, PNG and WEBP apart by their bytes", async () => {
    expect(detectPhotoType(await tinyImage("jpeg"))).toBe("image/jpeg");
    expect(detectPhotoType(await tinyImage("png"))).toBe("image/png");
    expect(detectPhotoType(await tinyImage("webp"))).toBe("image/webp");
  });

  it("names nothing else as a photo", async () => {
    const gif = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#000000" },
    })
      .gif()
      .toBuffer();
    for (const bytes of [
      gif,
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      Buffer.from("%PDF-1.7"),
      Buffer.from("RIFF0000WAVE"),
      Buffer.from([0xff, 0xd8]),
      Buffer.alloc(0),
    ]) {
      expect(detectPhotoType(bytes)).toBeNull();
    }
  });

  it("accepts a real image under its true type and gives the JPEG to store", async () => {
    const png = await tinyImage("png");
    const result = await checkPhotoUpload(
      new File([new Uint8Array(png)], "me.jpg", { type: "image/jpeg" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.photo.type).toBe("image/png");
    expect(result.photo.bytes.equals(png)).toBe(true);
    expect(result.photo.optimized.contentType).toBe("image/jpeg");
  });

  it("refuses a missing file, a disallowed label, a fake image and an oversized one", async () => {
    expect(await checkPhotoUpload(null)).toMatchObject({ ok: false, status: 400 });
    expect(await checkPhotoUpload("text")).toMatchObject({ ok: false, status: 400 });
    expect(
      await checkPhotoUpload(new File([new Uint8Array(await tinyImage("png"))], "a.gif", { type: "image/gif" })),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await checkPhotoUpload(new File(["hello"], "a.png", { type: "image/png" })),
    ).toEqual({ ok: false, status: 400, error: NOT_A_PHOTO });
    expect(
      await checkPhotoUpload(
        new File([Buffer.alloc(MAX_PHOTO_BYTES + 1)], "a.jpg", { type: "image/jpeg" }),
      ),
    ).toMatchObject({ ok: false, status: 413 });
  });

  it("spots a request too big to be a photo upload from its declared length", () => {
    const sized = (length: number) =>
      new Request("http://localhost/upload", {
        method: "POST",
        headers: { "content-length": String(length) },
      });
    expect(photoRequestTooLarge(sized(MAX_PHOTO_BYTES))).toBe(false);
    expect(photoRequestTooLarge(sized(MAX_PHOTO_BYTES * 2))).toBe(true);
    expect(photoRequestTooLarge(new Request("http://localhost/upload"))).toBe(false);
  });
});

describe("photo addresses", () => {
  const appPhoto = "/api/files/submissions/abc/dean.jpg?v=1";

  it("lets through photos uploaded to the app, and empty fields", () => {
    expect(photoNotUploadedHere({ deanImageUrl: appPhoto, hodImageUrl: "" }, null)).toBeNull();
    expect(photoNotUploadedHere({ deanName: "Prof. A" }, null)).toBeNull();
    expect(photoNotUploadedHere(null, null)).toBeNull();
  });

  it("names a photo field holding any other address", () => {
    expect(photoNotUploadedHere({ deanImageUrl: "https://example.com/a.jpg" }, null)).toBe(
      "dean's photo",
    );
    expect(photoNotUploadedHere({ hodImageUrl: "/api/files/../x" }, {})).toBe("HOD's photo");
    expect(photoNotUploadedHere({ hodImageUrl: { url: appPhoto } }, {})).toBe("HOD's photo");
  });

  it("lets an address already saved stay, but not change to another", () => {
    const saved = { hodImageUrl: "https://old.example/hod.jpg" };
    expect(photoNotUploadedHere({ ...saved }, saved)).toBeNull();
    expect(photoNotUploadedHere({ hodImageUrl: "https://new.example/hod.jpg" }, saved)).toBe(
      "HOD's photo",
    );
  });
});

describe("loading photos for the exports", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never fetches an address that isn't an app photo", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const url of [
      "https://example.com/a.jpg",
      "http://169.254.169.254/latest/meta-data/",
      "file:///etc/passwd",
      "",
      null,
    ]) {
      expect(await loadPhoto(url)).toBeNull();
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
