import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Tasks E2 and E3 on a real database: a draft filled from the 2023-2027
// bulletin keeps each field marked until the Head edits it or marks it
// reviewed (V18), and Submit says what is left. Uses its own ids (zct-...)
// and the real Physiology code, whose 2023-2027 text is in the baseline.

const authState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/auth", () => {
  const access = () =>
    authState.userId ? { userId: authState.userId, sessionId: `session-${authState.userId}`, mfa: "verified" } : null;
  return {
    auth: async () => (authState.userId ? { user: { id: authState.userId } } : null),
    getSessionAccess: async () => access(),
    getSessionUserId: async () => access()?.userId ?? null,
    signIn: vi.fn(),
    signOut: vi.fn(),
    handlers: {},
  };
});

import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { GET as readBaseline, POST as markReviewed } from "@/app/api/submissions/[id]/baseline/route";
import { PUT as saveDraft } from "@/app/api/submissions/[id]/route";
import { baselineFor, carryPlan } from "@/lib/bulletin/baseline";
import { getSubmitReadinessIssues } from "@/lib/submissions/submit-readiness";

const ids = { school: "zct-school", department: "zct-dept", programme: "zct-prog", hod: "zct-hod", cycle: "zct-cycle", draft: "zct-draft" };
const params = { params: Promise.resolve({ id: ids.draft }) };
const json = (method: string, body: unknown) =>
  new NextRequest("http://localhost", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("text carried over from 2023-2027 (E2, E3, V18)", () => {
  let filled: Record<string, unknown>;

  beforeAll(async () => {
    authState.userId = ids.hod;
    await prisma.school.create({ data: { id: ids.school, code: "ZCTS", name: "School of Carry Tests" } });
    await prisma.department.create({ data: { id: ids.department, code: "ZCTS-PIO", name: "Department of Carry Tests", schoolId: ids.school } });
    await prisma.programme.create({
      data: { id: ids.programme, code: "SBMS-PIO-PIO", name: "Physiology", degreeType: "B.Sc.", duration: 4, departmentId: ids.department },
    });
    await prisma.user.create({
      data: { id: ids.hod, email: "zct-hod@babcock.edu.ng", firstName: "Carry", lastName: "Head", role: "HOD", schoolId: ids.school, departmentId: ids.department },
    });
    await prisma.mfaVerification.create({ data: { userId: ids.hod, sessionId: `session-${ids.hod}`, method: "AUTHENTICATOR" } });
    await prisma.reviewCycle.create({ data: { id: ids.cycle, name: "ZCT cycle", createdById: ids.hod } });
    await prisma.submission.create({ data: { id: ids.draft, title: "ZCT draft", programmeId: ids.programme, cycleId: ids.cycle, createdById: ids.hod } });
    // What scripts/carry-2023-2027-text.ts does for one draft.
    const plan = carryPlan(baselineFor("SBMS-PIO-PIO")!, null);
    filled = plan.patch;
    await prisma.submissionContent.create({ data: { submissionId: ids.draft, ...(plan.patch as object), carriedFields: plan.carried } });
  });

  afterAll(async () => {
    authState.userId = null;
    await prisma.submission.deleteMany({ where: { id: ids.draft } });
    await prisma.reviewCycle.deleteMany({ where: { id: ids.cycle } });
    await prisma.programme.deleteMany({ where: { id: ids.programme } });
    await prisma.activityLog.deleteMany({ where: { actorId: ids.hod } });
    await prisma.mfaVerification.deleteMany({ where: { userId: ids.hod } });
    await prisma.user.deleteMany({ where: { id: ids.hod } });
    await prisma.department.deleteMany({ where: { id: ids.department } });
    await prisma.school.deleteMany({ where: { id: ids.school } });
  });

  it("shows the 2023-2027 text and what is still to review", async () => {
    const res = await readBaseline(new Request("http://localhost"), params);
    const body = await res.json();
    expect(body).toMatchObject({ hasBaseline: true, file: "B.Sc. (Hons.) Physiology" });
    expect(body.carried).toEqual(expect.arrayContaining(["mission", "philosophy", "objectives", "utmeRequirements"]));
    expect(body.texts.philosophy).toMatch(/Physiology/);
  });

  it("asks Submit to wait until the carried text is reviewed (V18)", async () => {
    const issues = await getSubmitReadinessIssues(ids.draft);
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["CARRIED_OVERVIEW", "CARRIED_ADMISSION"]));
  });

  it("drops a field when the Head marks it reviewed, or edits it", async () => {
    const reviewed = await markReviewed(json("POST", { reviewed: ["mission"] }), params);
    expect((await reviewed.json()).carried).not.toContain("mission");

    // The page sends every field on save: only the edited one stops being carried.
    const saved = await saveDraft(json("PUT", { content: { ...filled, philosophy: `${filled.philosophy} We also teach research ethics.` } }), params);
    expect(saved.status).toBe(200);
    const after = await prisma.submissionContent.findUniqueOrThrow({ where: { submissionId: ids.draft }, select: { carriedFields: true } });
    expect(after.carriedFields).not.toContain("philosophy");
    expect(after.carriedFields).toContain("objectives");
  });

  it("drafts the Summary of Changes from the differences", async () => {
    const res = await readBaseline(new Request("http://localhost/?summary=1"), params);
    const { html } = await res.json();
    expect(html).toContain("Philosophy: revised.");
    expect(html).not.toContain("Mission:");
    expect(html).toContain("Courses removed");
  });
});
