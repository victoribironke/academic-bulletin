// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { splitPolicy } from "@/lib/policy/sections";

vi.mock("@/contexts/user-context", () => ({ useUser: () => ({ currentUser: { role: "HOD" }, isLoading: false }) }));

import PolicyPage from "@/app/(main)/policy/page";

// Task H9: a Head of Department finds "Academic Load" quickly.

const document = splitPolicy(readFileSync(join(process.cwd(), "data/policy/academic-policy-2025-09-08.md"), "utf8"));
const version = {
  id: "built-in-2025-09-08",
  label: "Updated September 8, 2025",
  note: "The Academic Policy is under review. Until Senate approves the revised policy, the version shown here applies.",
  sourceName: "Academic Policies Manual 2023-2027",
  createdAt: null,
  isCurrent: true,
  builtIn: true,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ...document, version, versions: [version] }), { status: 200 }))),
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the Academic Policy page", () => {
  it("shows the note, the contents and the text", async () => {
    render(<PolicyPage />);
    expect(await screen.findByText(/The Academic Policy is under review/)).toBeTruthy();
    const contents = screen.getAllByRole("navigation", { name: "Contents" })[0];
    expect(within(contents).getByRole("link", { name: "Academic Load" }).getAttribute("href")).toBe("#academic-load");
    expect(screen.getByRole("heading", { name: "Academic Load" }).id).toBe("academic-load");
    // No upload button for a Head of Department.
    expect(screen.queryByRole("button", { name: /Upload a new version/ })).toBeNull();
  });

  it("narrows the contents and the text to what the search finds", async () => {
    render(<PolicyPage />);
    await screen.findByRole("heading", { name: "Academic Load" });
    fireEvent.change(screen.getByLabelText("Search the Academic Policy"), { target: { value: "academic load" } });
    expect(screen.getByRole("status").textContent).toMatch(/mentions? “academic load”/);
    const contents = screen.getAllByRole("navigation", { name: "Contents" })[0];
    const links = within(contents).getAllByRole("link").map((link) => link.textContent);
    expect(links).toContain("Academic Load");
    expect(links.length).toBeLessThan(10);
    // Clicking the line opens the section.
    fireEvent.click(within(contents).getByRole("link", { name: "Academic Load" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getAllByText(/academic load/i, { selector: "mark" }).length).toBeGreaterThan(0);
  });
});
