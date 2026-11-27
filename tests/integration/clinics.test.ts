import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Task H8 on a real database: DAP adds the weekly clinics on the cycle's
// Calendar screen, and Heads of Department see the next ones on their home
// page. Uses its own ids (zcl-...).

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
import { DELETE as removeEntry, POST as changeCalendar } from "@/app/api/cycles/[id]/calendar/route";
import { GET as homeClinics } from "@/app/api/calendar/clinics/route";

const ids = { school: "zcl-school", department: "zcl-dept", hod: "zcl-hod", admin: "zcl-admin", cycle: "zcl-cycle" };
const users = [ids.hod, ids.admin];
const link = "https://meet.example.org/zcl-clinic?pwd=secret";

const as = (userId: string) => {
  authState.userId = userId;
};
const post = (body: unknown) =>
  changeCalendar(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: ids.cycle }),
  });
const remove = (body: unknown) =>
  removeEntry(new Request("http://localhost", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: ids.cycle }),
  });

describe("Clinics (H8)", () => {
  beforeAll(async () => {
    await prisma.school.create({ data: { id: ids.school, code: "ZCLS", name: "School of Clinic Tests" } });
    await prisma.department.create({ data: { id: ids.department, code: "ZCLS-CL", name: "Department of Clinics", schoolId: ids.school } });
    await prisma.user.createMany({
      data: [
        { id: ids.hod, email: "zcl-hod@babcock.edu.ng", firstName: "Clinic", lastName: "Head", role: "HOD", schoolId: ids.school, departmentId: ids.department },
        { id: ids.admin, email: "zcl-admin@babcock.edu.ng", firstName: "Planning", lastName: "Admin", role: "ADMIN" },
      ],
    });
    await prisma.mfaVerification.createMany({
      data: users.map((userId) => ({ userId, sessionId: `session-${userId}`, method: "AUTHENTICATOR" as const })),
    });
    // The newest active cycle, so the home page reads this one.
    await prisma.reviewCycle.create({
      data: {
        id: ids.cycle,
        name: "ZCL cycle",
        createdById: ids.admin,
        startedAt: new Date("2099-01-01T00:00:00Z"),
        phases: { create: { phase: 1, name: "Departmental Drafting", label: "Drafting", scope: "PROGRAMME", desk: "HOD", dueAt: new Date("2099-02-04") } },
      },
    });
  });

  beforeEach(() => {
    authState.userId = null;
  });

  afterAll(async () => {
    await prisma.reviewCycle.deleteMany({ where: { id: ids.cycle } });
    await prisma.activityLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.mfaVerification.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.department.deleteMany({ where: { id: ids.department } });
    await prisma.school.deleteMany({ where: { id: ids.school } });
  });

  it("lets only DAP add a clinic, and keeps it off the Sabbath", async () => {
    as(ids.hod);
    expect((await post({ action: "clinic", weekday: "TUE", startTime: "14:00", joinUrl: link })).status).toBe(403);
    as(ids.admin);
    const sabbath = await post({ action: "clinic", weekday: "SAT", startTime: "10:00", joinUrl: link });
    expect(sabbath.status).toBe(400);
    expect((await sabbath.json()).error).toBe("Saturday is the Sabbath; choose another day.");
    expect((await post({ action: "clinic", weekday: "TUE", startTime: "14:00", joinUrl: "http://meet.example.org/x" })).status).toBe(400);
  });

  it("shows DAP each clinic with its next session, and logs it without the link", async () => {
    as(ids.admin);
    const response = await post({ action: "clinic", weekday: "TUE", startTime: "14:00", joinUrl: link, untilDate: "2099-12-31" });
    expect(response.status).toBe(200);
    await post({ action: "clinic", weekday: "THU", startTime: "11:00", joinUrl: link, untilDate: "2099-12-31" });
    const { calendar } = await response.json();
    expect(calendar.clinics).toHaveLength(1);
    expect(calendar.clinics[0]).toMatchObject({ title: "Clinic for Heads of Department", schedule: "Every Tuesday, 2:00 pm to 2:30 pm", joinUrl: link });
    expect(calendar.clinics[0].next.time).toBe("2:00 pm to 2:30 pm");

    const logged = await prisma.activityLog.findMany({ where: { actorId: ids.admin, action: "CALENDAR_CLINIC_ADDED" }, select: { description: true } });
    expect(logged).toHaveLength(2);
    // Two rows written within the same moment: their order isn't fixed.
    expect(logged.some((row) => row.description.includes("every Tuesday, 2:00 pm to 2:30 pm"))).toBe(true);
    expect(logged.some((row) => row.description.includes("secret"))).toBe(false);
  });

  it("shows a Head the next two clinics with the joining link", async () => {
    as(ids.hod);
    const response = await homeClinics();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sessions).toHaveLength(2);
    expect(body.sessions.every((session: { joinUrl: string }) => session.joinUrl === link)).toBe(true);
    expect(body.schedule).toEqual(["Every Tuesday, 2:00 pm to 2:30 pm", "Every Thursday, 11:00 am to 11:30 am"]);
    expect(body.until).toBe("2099-12-31");
  });

  it("removes a clinic only after DELETE is typed", async () => {
    as(ids.admin);
    const clinic = await prisma.cycleClinic.findFirstOrThrow({ where: { cycleId: ids.cycle, weekday: "THU" } });
    expect((await remove({ kind: "clinic", itemId: clinic.id })).status).toBe(400);
    const response = await remove({ kind: "clinic", itemId: clinic.id, confirm: "DELETE" });
    expect(response.status).toBe(200);
    expect((await response.json()).calendar.clinics.map((row: { schedule: string }) => row.schedule)).toEqual(["Every Tuesday, 2:00 pm to 2:30 pm"]);
    as(ids.hod);
    expect((await (await homeClinics()).json()).schedule).toEqual(["Every Tuesday, 2:00 pm to 2:30 pm"]);
  });
});
