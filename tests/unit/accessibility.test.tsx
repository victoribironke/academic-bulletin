// @vitest-environment jsdom

import axe from "axe-core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveStatus } from "@/components/shared/save-status";
import { OfflineBanner } from "@/components/shared/offline-banner";
import { CreditSummaryTable } from "@/components/courses/credit-summary-table";
import { CommentsList } from "@/components/submissions/comments-list";
import { RegistryFilterSelects } from "@/components/courses/registry-filters";
import { ElectiveGroupsPanel } from "@/components/courses/elective-groups-panel";
import { LeaderDetails } from "@/components/submissions/leader-details";
import { ReadinessPanel } from "@/components/submissions/readiness-panel";
import { creditSummary } from "@/lib/courses/credit-summary";

// Task U5: usable by everyone (WCAG 2.2 AA). An automated accessibility
// check (axe) runs on the screens built for R2 with every test run; it
// fails on any serious or critical problem: missing labels, names, roles.

async function problems(container: HTMLElement) {
  const result = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    // jsdom has no layout, so colour contrast is checked by eye and in the browser.
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("accessibility of the R2 screens (U5)", () => {
  it("catches a control with no name (the check itself works)", async () => {
    const { container } = render(
      <main>
        <button type="button">
          <svg aria-hidden="true" />
        </button>
        <input type="text" />
      </main>,
    );
    const found = await problems(container);
    expect(found.some((item) => item.startsWith("button-name"))).toBe(true);
    expect(found.some((item) => item.startsWith("label"))).toBe(true);
  });

  it("save status, the offline banner and the credit summary", async () => {
    vi.stubGlobal("navigator", { ...navigator, onLine: false });
    const { container } = render(
      <main>
        <SaveStatus state="saved" savedAt={new Date("2026-11-27T09:42:00Z")} />
        <SaveStatus state="error" savedAt={null} />
        <OfflineBanner />
        <CreditSummaryTable
          summary={creditSummary([
            { level: 100, units: 3, generalEducation: true, owned: true },
            { level: 100, units: 3, generalEducation: false, owned: true },
            { level: 200, units: 2, generalEducation: false, owned: false },
          ])}
        />
      </main>,
    );
    expect(screen.getByText(/You're offline/)).toBeTruthy();
    expect(await problems(container)).toEqual([]);
  });

  it("comments in one place, and the Registry filters", async () => {
    const { container } = render(
      <main>
        <CommentsList
          comments={[
            {
              id: "c1",
              content: "Say who the programme is for.",
              section: "overview",
              phase: 2,
              type: "ISSUE",
              status: "OPEN",
              createdAt: "2026-11-27T09:00:00Z",
              author: { firstName: "Ada", lastName: "Dean", role: "DEAN" },
            },
          ]}
          decisions={[]}
          sections={[{ key: "overview", title: "Programme Overview" }]}
          activeSection="overview"
          canResolve
          onResolve={() => undefined}
        />
        <RegistryFilterSelects
          facets={{ level: [{ value: "100", label: "100 level", count: 4 }, { value: "200", label: "200 level", count: 2 }] }}
          filters={{}}
          onChange={() => undefined}
        />
      </main>,
    );
    expect(await problems(container)).toEqual([]);
  });

  it("elective groups, the Dean and Head boxes, and the readiness panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ready: false,
              counts: { mustFix: 1, pleaseCheck: 0, accepted: 0 },
              results: [{ rule: "V1", level: "MUST", section: "graduation", key: "V1", message: "The totals differ.", accepted: null }],
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    const { container } = render(
      <main>
        <ElectiveGroupsPanel
          submissionId="d1"
          groups={[{ id: "g1", name: "400 level options", chooseUnits: 3, courses: ["ECO 401", "ECO 411"], offeredUnits: 6 }]}
          onChanged={() => undefined}
        />
        <LeaderDetails
          submissionId="d1"
          role="dean"
          leader={{ title: "Prof.", name: "Ada Dean", imageUrl: null }}
          place="School of Practice"
          canEdit
          onSaved={() => undefined}
        />
        <ReadinessPanel submissionId="d1" refreshKey="0" canEdit onGoToSection={() => undefined} />
      </main>,
    );
    await waitFor(() => expect(screen.getByText(/Before it can be submitted/)).toBeTruthy());
    expect(await problems(container)).toEqual([]);
  });
});

describe("Low data (U4)", () => {
  it("doesn't download a stored photo while Low data is on, and shows it on request", async () => {
    const { StoredPhoto } = await import("@/components/shared/stored-photo");
    const { fireEvent } = await import("@testing-library/react");
    localStorage.setItem("abrs-low-data", "on");
    const { container } = render(<StoredPhoto src="/api/files/staff/a.jpg" alt="Ada Example" className="size-10" />);
    expect(container.querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show the photo: Ada Example" }));
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/files/staff/a.jpg");
    localStorage.removeItem("abrs-low-data");
  });
});
