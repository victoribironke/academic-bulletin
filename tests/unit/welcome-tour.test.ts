import { describe, expect, it } from "vitest";
import { WELCOME_SEEN_KEY, welcomeTourFor } from "@/lib/help/welcome-tour";

// Task U6: a three-step welcome on first sign-in, skippable.

describe("welcome tour (U6)", () => {
  it("has three steps for the people who draft and review", () => {
    for (const role of ["HOD", "PROGRAMME_COORDINATOR", "DEAN"]) expect(welcomeTourFor(role)).toHaveLength(3);
    expect(welcomeTourFor("ADMIN")).toBeNull();
    expect(welcomeTourFor(null)).toBeNull();
  });

  it("tells a Head they submit, and a coordinator that the Head does", () => {
    expect(welcomeTourFor("HOD")![1].body).toContain("Only you submit");
    expect(welcomeTourFor("PROGRAMME_COORDINATOR")![1].body).toContain("Only your Head of Department submits");
    expect(welcomeTourFor("DEAN")![1].body).toContain("request a revision");
  });

  it("is remembered per person", () => {
    expect(WELCOME_SEEN_KEY("u1")).not.toBe(WELCOME_SEEN_KEY("u2"));
  });
});
