import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Task B6 on a real database: each owner sees "Courses we own", writes a
// course's description once for every programme (W16), and the owner fill
// gives unowned courses an owner. Uses its own codes (ZOW...).

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
import { GET as listOwned } from "@/app/api/courses-we-own/route";
import { PUT as saveOwned } from "@/app/api/courses-we-own/[id]/route";
import { applyCourseOwners, planCourseOwnersFromDatabase } from "@/lib/courses/course-owners";
import { GET as graceResult, POST as runGrace } from "@/app/api/courses-we-own/[id]/grace/route";

const ids = {
  school: "zow-school",
  owners: "zow-dept-owners",
  others: "zow-dept-others",
  hodOwners: "zow-hod-owners",
  hodOthers: "zow-hod-others",
  dean: "zow-dean",
  admin: "zow-admin",
  programmeOwners: "zow-prog-owners",
  programmeOthers: "zow-prog-others",
  cycle: "zow-cycle",
  draftOthers: "zow-draft-others",
};
const users = [ids.hodOwners, ids.hodOthers, ids.dean, ids.admin];

const as = (userId: string) => {
  authState.userId = userId;
};
const list = async (owner?: string) => {
  const response = await listOwned(new Request(`http://localhost/api/courses-we-own${owner ? `?owner=${owner}` : ""}`));
  return { status: response.status, body: await response.json() };
};
const save = (id: string, body: unknown) =>
  saveOwned(
    new Request("http://localhost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

describe("Courses we own (B6)", () => {
  beforeAll(async () => {
    await prisma.school.create({ data: { id: ids.school, code: "ZOWS", name: "School of Owning Tests" } });
    await prisma.department.createMany({
      data: [
        { id: ids.owners, code: "ZOWS-OWN", name: "Department of Owners", schoolId: ids.school },
        { id: ids.others, code: "ZOWS-OTH", name: "Department of Others", schoolId: ids.school },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: ids.hodOwners, email: "zow-owners@babcock.edu.ng", firstName: "Owner", lastName: "Head", role: "HOD", schoolId: ids.school, departmentId: ids.owners },
        { id: ids.hodOthers, email: "zow-others@babcock.edu.ng", firstName: "Other", lastName: "Head", role: "HOD", schoolId: ids.school, departmentId: ids.others },
        { id: ids.dean, email: "zow-dean@babcock.edu.ng", firstName: "School", lastName: "Dean", role: "DEAN", schoolId: ids.school },
        { id: ids.admin, email: "zow-admin@babcock.edu.ng", firstName: "Planning", lastName: "Admin", role: "ADMIN" },
      ],
    });
    await prisma.mfaVerification.createMany({
      data: users.map((userId) => ({ userId, sessionId: `session-${userId}`, method: "AUTHENTICATOR" as const })),
    });
    await prisma.programme.createMany({
      data: [
        { id: ids.programmeOwners, code: "ZOWS-OWN-A", name: "Owning Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.owners },
        { id: ids.programmeOthers, code: "ZOWS-OTH-B", name: "Borrowing Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.others },
      ],
    });
    const master = (id: string, code: string, extra: Record<string, unknown>) =>
      prisma.masterCourse.create({ data: { id, code, title: `${code} title`, units: 2, level: 300, semester: 1, ...extra } });
    await master("zow-101", "ZOW 101", { ownership: "DEPARTMENT", ownerDeptId: ids.owners });
    await master("zow-102", "ZOW 102", { ownership: "DEPARTMENT", ownerDeptId: ids.owners });
    await master("zow-150", "BU-ZOS 150", { ownership: "SCHOOL", ownerSchoolId: ids.school });
    await master("zow-201", "ZOT 201", { ownership: "DEPARTMENT", ownerDeptId: ids.others });
    await master("zow-301", "ZOW 301", { ownership: "INSTITUTIONAL" });
    await master("zow-gst", "BU-GST 999", { ownership: "INSTITUTIONAL", type: "GST_BU" });
    await master("zow-ref", "ZOW 900", { ownership: "DEPARTMENT", ownerDeptId: ids.owners }); // national only: not offered
    await prisma.programmeCourse.createMany({
      data: [
        { programmeId: ids.programmeOwners, courseId: "zow-101" },
        { programmeId: ids.programmeOthers, courseId: "zow-101" },
        { programmeId: ids.programmeOwners, courseId: "zow-102" },
        { programmeId: ids.programmeOthers, courseId: "zow-201" },
        { programmeId: ids.programmeOwners, courseId: "zow-301" },
        { programmeId: ids.programmeOthers, courseId: "zow-gst" },
      ],
    });
    await prisma.reviewCycle.create({ data: { id: ids.cycle, name: "ZOW cycle", createdById: ids.admin } });
    await prisma.submission.create({ data: { id: ids.draftOthers, title: "zow draft", programmeId: ids.programmeOthers, cycleId: ids.cycle, createdById: ids.admin } });
    await prisma.course.create({
      data: { id: "zow-row", submissionId: ids.draftOthers, code: "ZOW 101", title: "ZOW 101 title", units: 2, level: 300, semester: 1, masterCourseId: "zow-101" },
    });
  });

  beforeEach(() => {
    authState.userId = null;
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { id: ids.draftOthers } });
    await prisma.reviewCycle.deleteMany({ where: { id: ids.cycle } });
    await prisma.masterCourse.deleteMany({ where: { id: { startsWith: "zow-" } } });
    await prisma.programme.deleteMany({ where: { id: { in: [ids.programmeOwners, ids.programmeOthers] } } });
    await prisma.activityLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.apiRateLimit.deleteMany({ where: { key: { contains: "zow-" } } }).catch(() => undefined);
    await prisma.mfaVerification.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.department.deleteMany({ where: { id: { in: [ids.owners, ids.others] } } });
    await prisma.school.deleteMany({ where: { id: ids.school } });
  });

  it("shows a Head the department's courses and the school's, and only those", async () => {
    as(ids.hodOwners);
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.canEdit).toBe(true);
    expect(body.owner.name).toBe("Department of Owners");
    expect(body.courses.map((course: { code: string }) => course.code)).toEqual(["BU-ZOS 150", "ZOW 101", "ZOW 102"]);
    const shared = body.courses.find((course: { code: string }) => course.code === "ZOW 101");
    expect(shared.programmes.map((programme: { name: string }) => programme.name)).toEqual(["Borrowing Studies", "Owning Studies"]);
    expect(shared.complete).toBe(false);
  });

  it("shows a Dean the school's courses to read", async () => {
    as(ids.dean);
    const { body } = await list();
    expect(body.canEdit).toBe(false);
    expect(body.courses.map((course: { code: string }) => course.code)).toEqual(["BU-ZOS 150", "ZOT 201", "ZOW 101", "ZOW 102"]);
  });

  it("lets DAP pick any owner, the General Education desk or the courses with no owner", async () => {
    as(ids.admin);
    const desk = await list();
    expect(desk.body.owner.name).toBe("General Education desk");
    expect(desk.body.courses.map((course: { code: string }) => course.code)).toContain("BU-GST 999");
    expect(desk.body.owners.map((choice: { key: string }) => choice.key)).toEqual(expect.arrayContaining(["ge", "none", `dept:${ids.owners}`, `school:${ids.school}`]));
    const none = await list("none");
    expect(none.body.courses.map((course: { code: string }) => course.code)).toContain("ZOW 301");
  });

  it("refuses a description from anyone but the owner or DAP", async () => {
    as(ids.hodOthers);
    expect((await save("zow-101", { learningOutcomes: "Rewrite it", courseContent: "Theirs." })).status).toBe(403);
    as(ids.hodOwners);
    expect((await save("zow-gst", { learningOutcomes: "Rewrite it", courseContent: "Ours." })).status).toBe(403);
    as(ids.dean);
    expect((await save("zow-150", { learningOutcomes: "Rewrite it", courseContent: "Ours." })).status).toBe(403);
  });

  it("saves the owner's text on the Registry course and in every open draft that uses it", async () => {
    as(ids.hodOwners);
    const response = await save("zow-101", {
      learningOutcomes: "Explain the ideas\n  \nApply the methods\nCompare the results",
      courseContent: " The content. ",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ draftRowsUpdated: 1, programmes: ["Borrowing Studies"] });
    const next = { learningOutcomes: ["Explain the ideas", "Apply the methods", "Compare the results"], courseContent: "The content." };
    expect(await prisma.masterCourse.findUnique({ where: { id: "zow-101" }, select: { learningOutcomes: true, courseContent: true } })).toEqual(next);
    expect(await prisma.courseDescription.findUnique({ where: { courseId: "zow-row" }, select: { learningOutcomes: true, courseContent: true } })).toEqual(next);

    const { body } = await list();
    expect(body.courses.find((course: { code: string }) => course.code === "ZOW 101").complete).toBe(true);

    // A school-owned course is any of the school's departments' to write.
    expect((await save("zow-150", { learningOutcomes: "Explain it", courseContent: "Shared by the school." })).status).toBe(200);
    as(ids.admin);
    expect((await save("zow-gst", { learningOutcomes: "Explain it", courseContent: "The desk's text." })).status).toBe(200);
  });

  it("runs GRACE on the shared text for the owner or DAP, and keeps one result for it (D9)", async () => {
    const at = (id: string) => ({ params: Promise.resolve({ id }) });
    as(ids.hodOwners);
    expect(await (await graceResult(new Request("http://localhost"), at("zow-102"))).json()).toEqual({ status: "NO_TEXT" });
    as(ids.hodOthers);
    expect((await runGrace(new Request("http://localhost", { method: "POST" }), at("zow-101"))).status).toBe(403);
    as(ids.admin);
    const run = await runGrace(new Request("http://localhost", { method: "POST" }), at("zow-gst"));
    expect(run.status).toBe(200);
    // No AI service in tests: the check records an error result, which the desk can retry.
    const body = await run.json();
    expect(["COMPLIANT", "NEEDS_REVISION", "ERROR"]).toContain(body.status);
    expect((await (await graceResult(new Request("http://localhost"), at("zow-gst"))).json()).status).toBe(body.status);
  });

  it("fills in a missing owner from the course's prefix, once", async () => {
    const plan = await planCourseOwnersFromDatabase(prisma);
    const ours = plan.changes.filter((change) => change.code.startsWith("ZOW"));
    expect(ours.map((change) => [change.code, change.owner.code, change.rule])).toEqual([["ZOW 301", "ZOWS-OWN", "SAME_PREFIX"]]);
    expect(plan.changes.some((change) => change.code === "BU-GST 999")).toBe(false);

    const { filled } = await applyCourseOwners(prisma, { ...plan, changes: ours }, { actorId: ids.admin });
    expect(filled).toBe(1);
    expect(await prisma.masterCourse.findUnique({ where: { id: "zow-301" }, select: { ownership: true, ownerDeptId: true } })).toEqual({
      ownership: "DEPARTMENT",
      ownerDeptId: ids.owners,
    });
    const again = await planCourseOwnersFromDatabase(prisma);
    expect(again.changes.some((change) => change.code.startsWith("ZOW"))).toBe(false);
  });
});
