import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Task D3: DAP holds the invitations until it is ready; while held, neither
// the daily job nor "Send waiting invitations" sends any. Uses its own ids
// (zih-...).

const authState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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

import prisma from "@/lib/prisma";
import { GET, POST, PUT } from "@/app/api/invitations/route";
import { INVITATIONS_HOLD_KEY, sendDueInvitations } from "@/lib/people/invitations";

const ids = { admin: "zih-admin", head: "zih-head" };
const users = [ids.admin, ids.head];
const afterLaunch = new Date("2026-11-27T07:00:00+01:00");

const as = (userId: string) => {
  authState.userId = userId;
};
const put = (body: unknown) =>
  PUT(new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("Holding the invitations (D3)", () => {
  beforeAll(async () => {
    await prisma.agentControl.deleteMany({ where: { key: INVITATIONS_HOLD_KEY } });
    await prisma.user.createMany({
      data: [
        { id: ids.admin, email: "zih-admin@babcock.edu.ng", firstName: "Planning", lastName: "Admin", role: "ADMIN" },
        { id: ids.head, email: "zih-head@babcock.edu.ng", firstName: "Waiting", lastName: "Head", role: "HOD" },
      ],
    });
    await prisma.mfaVerification.createMany({
      data: users.map((userId) => ({ userId, sessionId: `session-${userId}`, method: "AUTHENTICATOR" as const })),
    });
  });

  beforeEach(() => {
    authState.userId = null;
  });

  afterAll(async () => {
    await prisma.agentControl.deleteMany({ where: { key: INVITATIONS_HOLD_KEY } });
    await prisma.activityLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.mfaVerification.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  it("is DAP's switch only", async () => {
    as(ids.head);
    expect((await put({ hold: true })).status).toBe(403);
    as(ids.admin);
    expect((await put({ hold: "yes" })).status).toBe(400);
  });

  it("stops the daily job and the Send button while held, and logs it", async () => {
    as(ids.admin);
    const response = await put({ hold: true, reason: "Until all the phase updates are in" });
    expect(response.status).toBe(200);
    expect((await response.json()).hold).toMatchObject({ held: true, reason: "Until all the phase updates are in" });
    expect((await (await GET()).json()).hold.held).toBe(true);

    expect(await sendDueInvitations(afterLaunch)).toEqual({ due: false, held: true, results: [] });
    const refused = await POST();
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("INVITATIONS_HELD");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.head } })).invitedAt).toBeNull();
    const logged = await prisma.activityLog.findFirstOrThrow({ where: { actorId: ids.admin, action: "INVITATIONS_HELD" } });
    expect(logged.description).toBe("Held the invitations: none goes out until the hold is released. Reason: Until all the phase updates are in");
  });

  it("sends again once DAP releases the hold", async () => {
    as(ids.admin);
    expect((await (await put({ hold: false })).json()).hold.held).toBe(false);
    const run = await sendDueInvitations(afterLaunch);
    expect(run).toMatchObject({ due: true, held: false });
    expect(run.results.some((result) => result.email === "zih-head@babcock.edu.ng")).toBe(true);
    expect(await prisma.activityLog.count({ where: { actorId: ids.admin, action: "INVITATIONS_RELEASED" } })).toBe(1);
  });
});
