import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Task G2 (programme coordinators) on a real database: a Head of Department
// names a coordinator for the department's programmes; the coordinator
// edits the whole programme but only the Head submits it. Uses its own ids
// (zco-...).

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

import prisma from "@/lib/prisma";
import { getApiUser, canWriteSubmission } from "@/lib/api-auth";
import { GET as listCoordinators, POST as nameCoordinator } from "@/app/api/coordinators/route";
import { DELETE as removeCoordinator } from "@/app/api/coordinators/[userId]/route";
import { POST as transition } from "@/app/api/submissions/[id]/transition/route";
import { COORDINATOR_SUBMIT_NOTE } from "@/lib/submissions/workflow";

const ids = {
  school: "zco-school",
  deptA: "zco-dept-a",
  deptB: "zco-dept-b",
  hodA: "zco-hod-a",
  hodB: "zco-hod-b",
  dean: "zco-dean",
  otherCoordinator: "zco-other-coordinator",
  newProgramme: "zco-prog-new",
  oldProgramme: "zco-prog-old",
  otherProgramme: "zco-prog-b",
  cycle: "zco-cycle",
  draft: "zco-draft",
};
const staff = [ids.hodA, ids.hodB, ids.dean, ids.otherCoordinator];
const email = "zco.coordinator@babcock.edu.ng";

const as = (userId: string) => {
  authState.userId = userId;
};
const json = (method: string, body: unknown) =>
  new Request("http://localhost", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const name = (body: Record<string, unknown>) =>
  nameCoordinator(json("POST", { firstName: "Ada", lastName: "Coordinator", email, programmeIds: [ids.newProgramme], ...body }));
const remove = (userId: string, programmeId: string, confirm: string | null = "DELETE") =>
  removeCoordinator(json("DELETE", { programmeId, ...(confirm !== null && { confirm }) }), { params: Promise.resolve({ userId }) });
const coordinator = () => prisma.user.findUniqueOrThrow({ where: { email }, include: { programmeAssignments: { select: { programmeId: true } } } });

describe("Programme coordinators (G2)", () => {
  beforeAll(async () => {
    await prisma.school.create({ data: { id: ids.school, code: "ZCOS", name: "School of Coordinator Tests" } });
    await prisma.department.createMany({
      data: [
        { id: ids.deptA, code: "ZCOS-A", name: "Department A", schoolId: ids.school },
        { id: ids.deptB, code: "ZCOS-B", name: "Department B", schoolId: ids.school },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: ids.hodA, email: "zco-hod-a@babcock.edu.ng", firstName: "Head", lastName: "A", role: "HOD", schoolId: ids.school, departmentId: ids.deptA },
        { id: ids.hodB, email: "zco-hod-b@babcock.edu.ng", firstName: "Head", lastName: "B", role: "HOD", schoolId: ids.school, departmentId: ids.deptB },
        { id: ids.dean, email: "zco-dean@babcock.edu.ng", firstName: "School", lastName: "Dean", role: "DEAN", schoolId: ids.school },
        { id: ids.otherCoordinator, email: "zco-other@babcock.edu.ng", firstName: "Other", lastName: "Coordinator", role: "PROGRAMME_COORDINATOR", schoolId: ids.school, departmentId: ids.deptB },
      ],
    });
    await prisma.programme.createMany({
      data: [
        { id: ids.newProgramme, code: "ZCOS-A-NEW", name: "New Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.deptA, isNew: true },
        { id: ids.oldProgramme, code: "ZCOS-A-OLD", name: "Old Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.deptA },
        { id: ids.otherProgramme, code: "ZCOS-B-ONE", name: "Other Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.deptB },
      ],
    });
    await prisma.reviewCycle.create({ data: { id: ids.cycle, name: "ZCO cycle", createdById: ids.hodA, isActive: false } });
    await prisma.submission.create({ data: { id: ids.draft, title: "zco draft", programmeId: ids.newProgramme, cycleId: ids.cycle, createdById: ids.hodA } });
  });

  beforeEach(() => {
    authState.userId = null;
  });

  afterAll(async () => {
    const named = await prisma.user.findMany({ where: { email }, select: { id: true } });
    const everyone = [...staff, ...named.map((user) => user.id)];
    await prisma.submission.deleteMany({ where: { id: ids.draft } });
    await prisma.reviewCycle.deleteMany({ where: { id: ids.cycle } });
    await prisma.activityLog.deleteMany({ where: { OR: [{ actorId: { in: everyone } }, { entityId: { in: everyone } }] } });
    await prisma.mfaVerification.deleteMany({ where: { userId: { in: everyone } } });
    await prisma.user.deleteMany({ where: { id: { in: everyone } } });
    await prisma.programme.deleteMany({ where: { id: { in: [ids.newProgramme, ids.oldProgramme, ids.otherProgramme] } } });
    await prisma.department.deleteMany({ where: { id: { in: [ids.deptA, ids.deptB] } } });
    await prisma.school.deleteMany({ where: { id: ids.school } });
  });

  it("is the Head's page only", async () => {
    await prisma.mfaVerification.createMany({
      data: staff.map((userId) => ({ userId, sessionId: `session-${userId}`, method: "AUTHENTICATOR" as const })),
    });
    as(ids.dean);
    expect((await listCoordinators()).status).toBe(403);
    expect((await name({})).status).toBe(403);
    as(ids.hodA);
    const response = await listCoordinators();
    expect(response.status).toBe(200);
    const body = await response.json();
    // New programmes first.
    expect(body.programmes.map((programme: { name: string; isNew: boolean }) => [programme.name, programme.isNew])).toEqual([
      ["New Studies", true],
      ["Old Studies", false],
    ]);
  });

  it("refuses what a Head may not do, saying why", async () => {
    as(ids.hodA);
    const error = async (response: Response) => [response.status, (await response.json()).error];
    expect(await error(await name({ email: "someone@gmail.com" }))).toEqual([400, "Use their babcock.edu.ng address: coordinators sign in with it."]);
    expect(await error(await name({ email: "ZCO-HOD-A@babcock.edu.ng" }))).toEqual([400, "You already draft and submit every programme in your department."]);
    expect(await error(await name({ programmeIds: [ids.otherProgramme] }))).toEqual([403, "Choose programmes in your own department."]);
    expect(await error(await name({ programmeIds: [] }))).toEqual([400, "Choose at least one programme for them to draft."]);
    expect(await error(await name({ email: "zco-dean@babcock.edu.ng" }))).toEqual([
      409,
      "zco-dean@babcock.edu.ng already has an account as Dean. Ask DAP if they should coordinate a programme instead.",
    ]);
    expect(await error(await name({ email: "zco-other@babcock.edu.ng" }))).toEqual([
      409,
      "zco-other@babcock.edu.ng already coordinates programmes in Department B. Ask DAP to move them.",
    ]);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it("names a coordinator, who edits the programme but cannot submit it", async () => {
    as(ids.hodA);
    const response = await name({ email: " ZCO.Coordinator@babcock.edu.ng " });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ name: "Ada Coordinator", created: true, programmes: ["New Studies"] });
    expect(body.invitation).toMatchObject({ email });
    expect(body.coordinators.programmes[0].coordinators).toEqual([
      expect.objectContaining({ name: "Ada Coordinator", email, signedIn: false }),
    ]);
    const person = await coordinator();
    expect(person).toMatchObject({ role: "PROGRAMME_COORDINATOR", departmentId: ids.deptA, schoolId: ids.school, isActive: true });
    expect(person.programmeAssignments).toEqual([{ programmeId: ids.newProgramme }]);
    const logged = await prisma.activityLog.findFirstOrThrow({ where: { actorId: ids.hodA, action: "COORDINATOR_NAMED" } });
    expect(logged.description).toBe(
      `Named Ada Coordinator (${email}) programme coordinator for New Studies. They edit the whole programme; only the Head of Department submits it.`,
    );

    await prisma.mfaVerification.create({ data: { userId: person.id, sessionId: `session-${person.id}`, method: "AUTHENTICATOR" } });
    as(person.id);
    expect(await canWriteSubmission((await getApiUser())!, ids.draft)).toBe(true);
    const refused = await transition(
      new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "SUBMIT" }) }) as never,
      { params: Promise.resolve({ id: ids.draft }) },
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: COORDINATOR_SUBMIT_NOTE, code: "HEAD_SUBMITS" });
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: ids.draft } })).status).toBe("DRAFT");
  });

  it("adds a programme to one of the department's coordinators", async () => {
    as(ids.hodA);
    const response = await name({ firstName: "Ignored", programmeIds: [ids.oldProgramme, ids.newProgramme] });
    expect(await response.json()).toMatchObject({ name: "Ada Coordinator", created: false, programmes: ["New Studies", "Old Studies"] });
    expect((await coordinator()).programmeAssignments.map((row) => row.programmeId).sort()).toEqual([ids.newProgramme, ids.oldProgramme].sort());
  });

  it("takes a coordinator off, switching the account off with the last programme", async () => {
    const person = await coordinator();
    // Another department's Head learns nothing about this department's people.
    as(ids.hodB);
    expect((await remove(person.id, ids.newProgramme)).status).toBe(404);
    as(ids.hodA);
    // Like every removal, it asks for DELETE to be typed (Q7).
    expect((await remove(person.id, ids.oldProgramme, null)).status).toBe(400);
    expect((await remove(person.id, ids.otherProgramme)).status).toBe(404);
    expect(await (await remove(person.id, ids.oldProgramme)).json()).toMatchObject({ programme: "Old Studies", switchedOff: false });
    expect(await (await remove(person.id, ids.newProgramme)).json()).toMatchObject({ programme: "New Studies", switchedOff: true });
    expect(await coordinator()).toMatchObject({ isActive: false, programmeAssignments: [] });
    const logged = await prisma.activityLog.findFirstOrThrow({ where: { actorId: ids.hodA, action: "COORDINATOR_REMOVED", description: { contains: "New Studies" } } });
    expect(logged.description).toBe("Took Ada Coordinator off New Studies as programme coordinator. With no other programme, their account is switched off.");

    // Named again: switched back on.
    expect((await name({})).status).toBe(200);
    expect(await coordinator()).toMatchObject({ isActive: true, programmeAssignments: [{ programmeId: ids.newProgramme }] });
  });
});
