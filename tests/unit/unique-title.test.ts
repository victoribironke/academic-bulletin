import { describe, expect, it } from "vitest";
import { titleKey, uniqueTitle } from "@/lib/courses/unique-title";

describe("uniqueTitle", () => {
  it("keeps a title that is free", () => {
    expect(uniqueTitle("Use of English", "GST 111", new Set())).toBe("Use of English");
  });

  it("adds the course code when the title is taken, ignoring case and spacing", () => {
    const taken = new Set([titleKey("Nigerian  peoples and culture")]);
    expect(uniqueTitle("Nigerian Peoples and Culture", "GST 113", taken)).toBe(
      "Nigerian Peoples and Culture (GST 113)",
    );
  });

  it("adds a number if the coded title is also taken", () => {
    const taken = new Set([
      titleKey("Ethics"),
      titleKey("Ethics (GST 212)"),
    ]);
    expect(uniqueTitle("Ethics", "GST 212", taken)).toBe("Ethics (GST 212) 2");
  });
});
