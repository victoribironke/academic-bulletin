// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const role = vi.hoisted(() => ({ current: "HOD" }));
vi.mock("@/contexts/user-context", () => ({ useUser: () => ({ currentUser: { role: role.current } }) }));

import { HelpButton } from "@/components/layout/help-button";

// Task H1: the help panel for a Head of Department.

const reply = (body: object) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the help panel", () => {
  it("shows a Head their deadline, the steps in the screens' words and their DAP officer", async () => {
    role.current = "HOD";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === "/api/help"
          ? reply({
              officer: { name: "Mrs. Ada Officer", email: "ada@babcock.edu.ng", whatsapp: "+2348030000001" },
              generalHelp: null,
              cycle: "2027-2031 Bulletin Development Cycle",
              submitOpens: "Monday, December 14, 2026",
            })
          : reply({
              desk: {
                label: "Departmental Drafting",
                headline: "70 days left",
                dueLine: "Due Thursday, February 4, 2027, 11:59 pm",
                nextLine: "Next: CP1 on Friday, December 11, 2026 (15 days)",
              },
            }),
      ),
    );
    render(<HelpButton />);
    fireEvent.click(screen.getByRole("button", { name: "Help and quick start" }));

    expect(await screen.findByText("Mrs. Ada Officer")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Quick start for Heads of Department" })).toBeTruthy();
    expect(screen.getByText("Your deadline: Departmental Drafting (70 days left)")).toBeTruthy();
    expect(screen.getByText("Next: CP1 on Friday, December 11, 2026 (15 days)")).toBeTruthy();
    expect(screen.getByText("Submit to School").tagName).toBe("STRONG");
    expect(screen.getByText(/it opens on Monday, December 14, 2026/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /WhatsApp \+2348030000001/ }).getAttribute("href")).toBe("https://wa.me/2348030000001");
    expect(screen.getByRole("link", { name: /Academic Policy/ }).getAttribute("href")).toBe("/policy");
  });

  it("gives Academic Planning their own steps and no officer box", async () => {
    role.current = "ADMIN";
    vi.stubGlobal("fetch", vi.fn(() => reply({ officer: null, generalHelp: null, cycle: null, submitOpens: null, desk: null })));
    render(<HelpButton />);
    fireEvent.click(screen.getByRole("button", { name: "Help and quick start" }));
    expect(await screen.findByRole("heading", { name: "Quick start for Academic Planning" })).toBeTruthy();
    expect(screen.getByText("Send waiting invitations")).toBeTruthy();
    expect(screen.queryByText("Your DAP officer")).toBeNull();
  });
});
