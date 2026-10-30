// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PhotoUploadGuidance } from "@/components/shared/photo-upload-guidance";

afterEach(cleanup);

describe("photo upload guidance", () => {
  it("shows upload limits, portrait requirements, and visual examples", () => {
    render(<PhotoUploadGuidance />);

    expect(
      screen.getByRole("region", { name: "Photo upload requirements" }),
    ).toBeTruthy();
    expect(screen.getByText(/at least 300 × 400 pixels/i)).toBeTruthy();
    expect(screen.getByText(/maximum file size: 4 mb/i)).toBeTruthy();
    expect(screen.getByText("Acceptable example")).toBeTruthy();
    expect(screen.getByText("Unacceptable examples")).toBeTruthy();
    expect(screen.getByText(/group photos, blurry or dark images/i)).toBeTruthy();
  });

  it("keeps the requirements but hides examples in compact lists", () => {
    render(<PhotoUploadGuidance compact />);

    expect(screen.getByText("Photo requirements")).toBeTruthy();
    expect(screen.queryByText("Acceptable example")).toBeNull();
  });
});
