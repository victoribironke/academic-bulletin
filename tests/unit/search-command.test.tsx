// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/contexts/user-context", () => ({ useUser: () => ({ currentUser: { id: "u1", role: "HOD" } }) }));

import { SearchCommand } from "@/components/layout/search-command";

beforeAll(() => {
  // cmdk measures and scrolls items; jsdom has neither.
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Task K4: Ctrl or Cmd + K, results grouped by type with the typed words
// marked, actions found by name, and Enter opens the result.
describe("the search palette (K4)", () => {
  it("opens with Ctrl+K, groups results, marks the words, and opens a result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          groups: [
            { type: "course", label: "Courses", results: [{ type: "course", id: "c1", title: "Principles of Economics I", code: "ECO 101", secondary: "2 units", url: "/master-courses?q=ECO%20101" }] },
            { type: "programme", label: "Programmes", results: [{ type: "programme", id: "p1", title: "Economics", code: "SMSC-ECO-ECO", secondary: "B.Sc.", url: "/academic-units?q=SMSC-ECO-ECO" }] },
          ],
        }),
        { status: 200 },
      ),
    );
    render(<SearchCommand />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox", { name: "Search" });
    fireEvent.change(input, { target: { value: "economics" } });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/search?q=economics");
    expect(screen.getByText("Courses")).toBeTruthy();
    expect(screen.getByText("Programmes")).toBeTruthy();
    expect(document.querySelectorAll("mark").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("ECO 101"));
    expect(push).toHaveBeenCalledWith("/master-courses?q=ECO%20101");
  });

  it("finds actions by name, and shows a Head no DAP-only action", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ groups: [] }), { status: 200 }));
    render(<SearchCommand />);
    fireEvent.click(screen.getByRole("button", { name: /Search/ }));
    const input = await screen.findByRole("combobox", { name: "Search" });
    const items = () => [...document.querySelectorAll("[cmdk-item]")].map((item) => item.textContent);
    fireEvent.change(input, { target: { value: "load" } });
    expect(items()).toContain("Academic Load policy");
    // The typed word is marked inside the action's name.
    expect(document.querySelector("[cmdk-item] mark")?.textContent).toBe("Load");
    fireEvent.change(input, { target: { value: "archive" } });
    expect(items()).not.toContain("Archive");
  });
});
