// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type WaitingItem, orderWaiting, waitedFor } from "@/lib/desk/waiting";
import { WaitingWork } from "@/components/desk/waiting-work";

// Task T1: what is waiting on a desk, and "Do this next".

const now = new Date("2026-12-01T10:00:00+01:00");
const item = (overrides: Partial<WaitingItem>): WaitingItem => ({
  key: "k",
  kind: "SECTIONS_TO_FINISH",
  programme: "Accounting",
  text: "3 of 8 sections to finish",
  href: "/submissions/a",
  since: null,
  waited: null,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("waiting work", () => {
  it("says how long something has waited", () => {
    expect(waitedFor(null, now)).toBeNull();
    expect(waitedFor(new Date("2026-12-01T08:00:00+01:00"), now)).toBe("waiting since today");
    expect(waitedFor(new Date("2026-11-30T09:00:00+01:00"), now)).toBe("waiting 1 day");
    expect(waitedFor(new Date("2026-11-20T09:00:00+01:00"), now)).toBe("waiting 11 days");
  });

  it("puts revisions first, then reviews, comments and sections, oldest first", () => {
    const ordered = orderWaiting([
      item({ key: "s", kind: "SECTIONS_TO_FINISH", since: "2026-11-26T00:00:00.000Z" }),
      item({ key: "c", kind: "OPEN_COMMENTS", since: "2026-11-28T00:00:00.000Z" }),
      item({ key: "r2", kind: "REVISION_REQUESTED", since: "2026-11-30T00:00:00.000Z" }),
      item({ key: "r1", kind: "REVISION_REQUESTED", since: "2026-11-29T00:00:00.000Z" }),
    ]);
    expect(ordered.map((entry) => entry.key)).toEqual(["r1", "r2", "c", "s"]);
  });

  it("shows the list with Do this next opening the first item", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                item({ key: "a", kind: "REVISION_REQUESTED", text: "Revision requested: Add the employability list.", href: "/submissions/a", waited: "waiting 2 days" }),
                item({ key: "b", programme: "Economics", href: "/submissions/b?section=staff" }),
              ],
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    render(<WaitingWork />);
    expect(await screen.findByRole("heading", { name: "What is waiting on you (2)" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Do this next/ }).getAttribute("href")).toBe("/submissions/a");
    expect(screen.getByRole("link", { name: /Economics/ }).getAttribute("href")).toBe("/submissions/b?section=staff");
    expect(screen.getByText("waiting 2 days")).toBeTruthy();
  });

  it("says when nothing is waiting", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200 }))));
    render(<WaitingWork />);
    expect(await screen.findByText("Nothing is waiting on you right now.")).toBeTruthy();
  });
});
