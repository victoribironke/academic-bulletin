import { describe, expect, it } from "vitest";
import { fileKeyFromUrl, fileUrl, isValidFileKey } from "@/lib/storage";

describe("storage keys", () => {
  it("accepts the paths the app stores photos under", () => {
    expect(isValidFileKey("submissions/abc123/dean.jpg")).toBe(true);
    expect(isValidFileKey("staff1/photo.webp")).toBe(true);
    expect(isValidFileKey("submissions/abc/hod-1793615840799.jpeg")).toBe(true);
  });

  it("rejects paths that could escape or confuse the bucket", () => {
    for (const key of ["", "../secret", "a/../b", "/abs.jpg", "a//b.jpg", "a/b c.jpg", "a\\b.jpg", "./x"]) {
      expect(isValidFileKey(key)).toBe(false);
    }
  });

  it("round-trips app file URLs and ignores other URLs", () => {
    const url = fileUrl("submissions/abc/dean.jpg", 42);
    expect(url).toBe("/api/files/submissions/abc/dean.jpg?v=42");
    expect(fileKeyFromUrl(url)).toBe("submissions/abc/dean.jpg");
    expect(fileKeyFromUrl("https://example.com/api/files/x.jpg")).toBeNull();
    expect(fileKeyFromUrl("/api/files/../etc/passwd")).toBeNull();
  });
});
