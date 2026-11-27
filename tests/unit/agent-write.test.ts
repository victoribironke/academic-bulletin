import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { factProblems, staysWithinFacts, templateMessage, writeMessage, type DeskFacts } from "@/lib/agent/write";

const facts: DeskFacts = {
  deskKey: "HOD:u1",
  recipient: { id: "u1", email: "hod@babcock.edu.ng", name: "Dr. Okafor", firstName: "Ada" },
  department: "Economics",
  status: { status: "ON_TRACK", label: "On track", reason: "On track: at the current pace it finishes 12 working days early (40% left)." },
  programmes: [
    { name: "Economics", submissionId: "s1", percentage: 60, toFinish: ["Course Structure (confirm the list)", "Course Details"], status: "On track", link: "https://academicplanning.app/submissions/s1?section=courses" },
  ],
  nextCheckpoint: { code: "CP1", name: "Course list and profile sections", date: "2026-12-11", days: 7 },
  finalDate: "2027-02-04",
  daysToFinal: 62,
  supervisor: null,
  leadership: [],
  homeLink: "https://academicplanning.app/dashboard",
  askLink: "https://academicplanning.app/dashboard",
};
const decision = { reasons: ["CP1 in 7 days"], mentions: [] };

afterEach(() => vi.useRealTimers());

describe("the agent's message (T3, T6)", () => {
  it("greets by title and surname and uses only the desk's own facts and links", () => {
    const message = templateMessage(facts, decision);
    expect(message.subject).toBe("Economics: CP1 in 7 days");
    expect(message.body).toContain("Good morning, Dr. Okafor.");
    expect(message.body).toContain("CP1 is in 7 days (Friday, December 11, 2026).");
    expect(message.body).toContain("Economics: 60% done. Still to finish: Course Structure (confirm the list), Course Details.");
    expect(message.body).toContain("https://academicplanning.app/submissions/s1?section=courses");
    expect(message.writtenBy).toBe("TEMPLATE");
  });

  it("uses the AI's text when it keeps to the facts", async () => {
    const ai = vi.fn(async () =>
      "Good morning, Dr. Okafor. CP1 is in 7 days. Economics is 60% done: confirming the course list is the next step. https://academicplanning.app/submissions/s1?section=courses Thank you. Directorate of Academic Planning",
    );
    const written = await writeMessage(facts, decision, { ai });
    expect(written.writtenBy).toBe("AI");
  });

  it("falls back to the template when the AI adds a number or a link, fails, or takes over 10 seconds", async () => {
    const invents = vi.fn(async () => "Good morning. You have 45 courses left. https://academicplanning.app/submissions/s1?section=courses");
    expect((await writeMessage(facts, decision, { ai: invents })).writtenBy).toBe("TEMPLATE");
    const strangeLink = vi.fn(async () => "Good morning. CP1 is in 7 days. https://example.com/phish");
    expect((await writeMessage(facts, decision, { ai: strangeLink })).writtenBy).toBe("TEMPLATE");
    const fails = vi.fn(async () => {
      throw new Error("model unavailable");
    });
    expect((await writeMessage(facts, decision, { ai: fails })).writtenBy).toBe("TEMPLATE");

    vi.useFakeTimers();
    const silent = vi.fn(() => new Promise<string>(() => undefined));
    const pending = writeMessage(facts, decision, { ai: silent });
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await pending).writtenBy).toBe("TEMPLATE");
  });

  it("checks numbers and links against the facts", () => {
    const template = templateMessage(facts, decision);
    expect(staysWithinFacts("CP1 in 7 days https://academicplanning.app/dashboard", template, facts)).toBe(true);
    expect(staysWithinFacts("CP1 in 8 days https://academicplanning.app/dashboard", template, facts)).toBe(false);
    expect(staysWithinFacts("CP1 in 7 days, no link", template, facts)).toBe(false);
    // A link at the end of a sentence keeps its full stop out of the link.
    expect(staysWithinFacts("CP1 is in 7 days: https://academicplanning.app/dashboard.", template, facts)).toBe(true);
    expect(factProblems("CP1 in 9 days https://example.org/x", template, facts)).toEqual([
      "numbers not in the facts: 9",
      "links not in the facts: https://example.org/x",
    ]);
  });

  it("says why the template was used (for DAP's samples)", async () => {
    expect((await writeMessage(facts, decision, { ai: null })).fallback).toBe("no AI key on this site");
    const invents = async () => "Good morning. CP1 is in 99 days. https://academicplanning.app/dashboard";
    expect((await writeMessage(facts, decision, { ai: invents })).fallback).toMatch(/numbers not in the facts: 99/);
  });
});

describe("the agent is safe by design (T6)", () => {
  it("writes nothing but its own messages, its controls and the log", () => {
    const files = [
      ...readdirSync(join(process.cwd(), "lib/agent")).map((name) => join("lib/agent", name)),
      "app/api/agent/route.ts",
      "app/api/agent/mine/route.ts",
      "app/api/cron/agent/route.ts",
    ];
    const writes = files.flatMap((file) =>
      [...readFileSync(join(process.cwd(), file), "utf8").matchAll(/prisma\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/g)].map(
        (match) => `${file}: ${match[1]}.${match[2]}`,
      ),
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.filter((write) => !/: (agentMessage|agentControl)\./.test(write))).toEqual([]);
    for (const file of files) {
      expect(readFileSync(join(process.cwd(), file), "utf8")).not.toMatch(/\$executeRaw|\$queryRawUnsafe|\$transaction/);
    }
  });
});
