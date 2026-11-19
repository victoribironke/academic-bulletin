// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/auth", () => ({ logOut: vi.fn() }));

import { TwoStepForm } from "@/components/auth/two-step-form";

const codes = Array.from({ length: 10 }, (_, i) => `AAAA${i}-BBBB${i}`);
const reply = (status: number, body: object) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

let assigned: string | null = null;

beforeEach(() => {
  assigned = null;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: (url: string) => (assigned = url) },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("two-step verification page", () => {
  it("walks a first-time admin through the QR code, first code and recovery codes", async () => {
    const fetchMock = vi.fn((url: string) =>
      url === "/api/mfa/setup"
        ? reply(200, {
            qrCode: "data:image/svg+xml;base64,PHN2Zy8+",
            secret: "ABCD EFGH",
            account: "staff@babcock.edu.ng",
            issuer: "Academic Bulletin",
          })
        : reply(200, { recoveryCodes: codes }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<TwoStepForm enrolled={false} email="staff@babcock.edu.ng" next="/users" />);

    expect(screen.getByRole("heading", { name: "Set up two-step verification" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show the QR code" }));

    const qr = await screen.findByRole("img", { name: /QR code to add Academic Bulletin/ });
    expect(qr.getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText("ABCD EFGH")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "12a3456" } });
    expect((screen.getByLabelText("6-digit code") as HTMLInputElement).value).toBe("123456");
    fireEvent.click(screen.getByRole("button", { name: "Turn on two-step verification" }));

    await screen.findByRole("heading", { name: "Save your recovery codes" });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/mfa/setup/confirm",
      expect.objectContaining({ body: JSON.stringify({ code: "123456" }) }),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(10);

    const continueButton = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(continueButton.disabled).toBe(false);
    fireEvent.click(continueButton);
    expect(assigned).toBe("/users");
  });

  it("shows the server's message for a wrong code and offers a recovery code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => reply(400, { error: "That code isn't right.", code: "WRONG_CODE" })),
    );
    render(<TwoStepForm enrolled email="staff@babcock.edu.ng" next="/dashboard" />);

    expect(screen.getByRole("heading", { name: "Enter your code" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That code isn't right.");
    expect(assigned).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Lost your phone? Use a recovery code" }));
    expect(screen.getByLabelText("Recovery code")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says how many recovery codes are left after using one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => reply(200, { ok: true, method: "RECOVERY_CODE", recoveryCodesLeft: 1 })),
    );
    render(<TwoStepForm enrolled email="staff@babcock.edu.ng" next="/dashboard" />);
    fireEvent.click(screen.getByRole("button", { name: "Lost your phone? Use a recovery code" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: "AAAA1-BBBB1" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await screen.findByRole("heading", { name: "Signed in with a recovery code" });
    expect(screen.getByText(/You have 1 recovery code left/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(assigned).toBe("/dashboard"));
  });
});
