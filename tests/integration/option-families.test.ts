import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Rule W18 on a real database: the three B.Agric. options share 100 to 400
// level. A change there through the course routes reaches the other
// options' drafts; 500 level stays each option's own; differences are listed
// and can be matched. Uses its own ids (zof-...) and the real B.Agric. codes.

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
import { POST as addCourse } from "@/app/api/courses/route";
import { DELETE as deleteCourse, PATCH as updateCourse } from "@/app/api/courses/[id]/route";
import { GET as readOptions, POST as matchOptions } from "@/app/api/submissions/[id]/options/route";

const ids = {
  school: "zof-school",
  department: "zof-dept",
  hod: "zof-hod",
  cycle: "zof-cycle",
  age: "zof-age",
  ans: "zof-ans",
  css: "zof-css",
  other: "zof-other",
};
const drafts = { age: "zof-draft-age", ans: "zof-draft-ans", css: "zof-draft-css", other: "zof-draft-other" };
const codes = { age: "SSAT-AIT-AGE", ans: "SSAT-AIT-ANS", css: "SSAT-AIT-CSS" };

const json = (method: string, body: unknown) =>
  new Request("http://localhost", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const rowsOf = (submissionId: string) =>
  prisma.course.findMany({ where: { submissionId }, orderBy: { code: "asc" }, select: { code: true, units: true, level: true, title: true } });
const options = (draft: string) => ({ params: Promise.resolve({ id: draft }) });

describe("Programmes with options (W18)", () => {
  beforeAll(async () => {
    authState.userId = ids.hod;
    await prisma.school.create({ data: { id: ids.school, code: "ZOFS", name: "School of Option Tests" } });
    await prisma.department.create({ data: { id: ids.department, code: "ZOFS-AIT", name: "Department of Options", schoolId: ids.school } });
    await prisma.programme.createMany({
      data: [
        { id: ids.age, code: codes.age, name: "Agricultural Economics and Extension", degreeType: "B.Agric.", duration: 5, departmentId: ids.department },
        { id: ids.ans, code: codes.ans, name: "Animal Science", degreeType: "B.Agric.", duration: 5, departmentId: ids.department },
        { id: ids.css, code: codes.css, name: "Crop Science and Soil Science", degreeType: "B.Agric.", duration: 5, departmentId: ids.department },
        { id: ids.other, code: "ZOFS-AIT-FST", name: "Food Science and Technology", degreeType: "B.Sc.", duration: 5, departmentId: ids.department },
      ],
    });
    await prisma.user.create({
      data: { id: ids.hod, email: "zof-hod@babcock.edu.ng", firstName: "Option", lastName: "Head", role: "HOD", schoolId: ids.school, departmentId: ids.department },
    });
    await prisma.mfaVerification.create({ data: { userId: ids.hod, sessionId: `session-${ids.hod}`, method: "AUTHENTICATOR" } });
    await prisma.reviewCycle.create({ data: { id: ids.cycle, name: "ZOF cycle", createdById: ids.hod } });
    for (const [key, programmeId] of [["age", ids.age], ["ans", ids.ans], ["css", ids.css], ["other", ids.other]] as const) {
      await prisma.submission.create({ data: { id: drafts[key], title: drafts[key], programmeId, cycleId: ids.cycle, createdById: ids.hod } });
    }
  });

  afterAll(async () => {
    authState.userId = null;
    await prisma.archivedRecord.deleteMany({ where: { archivedById: ids.hod } });
    await prisma.submission.deleteMany({ where: { id: { in: Object.values(drafts) } } });
    await prisma.reviewCycle.deleteMany({ where: { id: ids.cycle } });
    await prisma.programme.deleteMany({ where: { id: { in: [ids.age, ids.ans, ids.css, ids.other] } } });
    await prisma.activityLog.deleteMany({ where: { actorId: ids.hod } });
    await prisma.mfaVerification.deleteMany({ where: { userId: ids.hod } });
    await prisma.user.deleteMany({ where: { id: ids.hod } });
    await prisma.department.deleteMany({ where: { id: ids.department } });
    await prisma.school.deleteMany({ where: { id: ids.school } });
  });

  it("adds a shared-level course to every option, and keeps 500 level each option's own", async () => {
    const shared = await addCourse(json("POST", { submissionId: drafts.age, code: "ZOF 201", title: "Shared Farm Practice", units: 2, level: 200, semester: 1 }));
    expect(shared.status).toBe(201);
    expect((await shared.json()).optionsNote).toBe("Also made in Animal Science and Crop Science and Soil Science, which share these levels.");
    const own = await addCourse(json("POST", { submissionId: drafts.age, code: "ZOF 501", title: "Farm Business Planning", units: 3, level: 500, semester: 1 }));
    expect((await own.json()).optionsNote).toBeNull();

    expect((await rowsOf(drafts.ans)).map((row) => row.code)).toEqual(["ZOF 201"]);
    expect((await rowsOf(drafts.css)).map((row) => row.code)).toEqual(["ZOF 201"]);
    expect(await rowsOf(drafts.other)).toEqual([]);
  });

  it("carries a change to a shared-level course", async () => {
    const row = await prisma.course.findUniqueOrThrow({ where: { code_submissionId: { code: "ZOF 201", submissionId: drafts.ans } } });
    const res = await updateCourse(json("PATCH", { units: 3, title: "Shared Farm Practice" }), { params: Promise.resolve({ id: row.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).optionsNote).toContain("Also made in Agricultural Economics and Extension and Crop Science and Soil Science");
    for (const draft of [drafts.age, drafts.css]) {
      expect((await rowsOf(draft)).find((course) => course.code === "ZOF 201")?.units).toBe(3);
    }
    // A save that changes nothing (the table sends every row) carries nothing.
    const again = await updateCourse(json("PATCH", { units: 3 }), { params: Promise.resolve({ id: row.id }) });
    expect((await again.json()).optionsNote).toBeNull();
  });

  it("lists what differs and makes the other options match", async () => {
    await prisma.course.create({ data: { submissionId: drafts.css, code: "ZOF 301", title: "Crop Only Course", units: 2, level: 300, semester: 1 } });
    await prisma.course.update({ where: { code_submissionId: { code: "ZOF 201", submissionId: drafts.css } }, data: { units: 4 } });

    const state = await (await readOptions(new Request("http://localhost"), options(drafts.age))).json();
    expect(state).toMatchObject({ family: "B.Agric. (Hons.) Agriculture", option: "Agricultural Economics and Extension", sharedLevels: "100 to 400 level" });
    const crop = state.options.find((option: { option: string }) => option.option === "Crop Science and Soil Science");
    expect(crop).toMatchObject({ missing: [], extra: ["ZOF 301"], changed: [{ code: "ZOF 201", fields: ["units"] }], canEdit: true });

    // Rows go to the Archive, so the DELETE word is asked for.
    expect((await matchOptions(json("POST", {}), options(drafts.age))).status).toBe(400);
    const matched = await matchOptions(json("POST", { confirm: "DELETE" }), options(drafts.age));
    expect(matched.status).toBe(200);
    const after = await matched.json();
    expect(after.options.every((option: { missing: string[]; extra: string[]; changed: unknown[] }) => !option.missing.length && !option.extra.length && !option.changed.length)).toBe(true);
    expect((await rowsOf(drafts.css)).map((row) => [row.code, row.units])).toEqual([["ZOF 201", 3]]);
    expect(await prisma.archivedRecord.count({ where: { entityType: "COURSE_ROW", label: { startsWith: "ZOF 301" } } })).toBe(1);
  });

  it("leaves a draft at another desk alone, and says so", async () => {
    await prisma.submission.update({ where: { id: drafts.css }, data: { currentPhase: 3, status: "IN_REVIEW" } });
    const res = await addCourse(json("POST", { submissionId: drafts.age, code: "ZOF 401", title: "Shared Field Trip", units: 1, level: 400, semester: 2 }));
    expect((await res.json()).optionsNote).toBe(
      "Also made in Animal Science, which share these levels. Not made in Crop Science and Soil Science: its draft isn't open to you at this stage.",
    );
    expect((await rowsOf(drafts.css)).map((row) => row.code)).toEqual(["ZOF 201"]);
    await prisma.submission.update({ where: { id: drafts.css }, data: { currentPhase: 1, status: "DRAFT" } });
  });

  it("removes a shared-level course from the other options, to the Archive", async () => {
    const row = await prisma.course.findUniqueOrThrow({ where: { code_submissionId: { code: "ZOF 201", submissionId: drafts.age } } });
    const res = await deleteCourse(json("DELETE", { confirm: "DELETE" }), { params: Promise.resolve({ id: row.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).optionsNote).toBe("Also made in Animal Science and Crop Science and Soil Science, which share these levels.");
    expect((await rowsOf(drafts.ans)).map((course) => course.code)).toEqual(["ZOF 401"]);
    expect((await rowsOf(drafts.css)).map((course) => course.code)).toEqual([]);
    expect((await rowsOf(drafts.age)).map((course) => course.code)).toEqual(["ZOF 401", "ZOF 501"]);
  });

  it("says nothing for a programme with no options", async () => {
    expect(await (await readOptions(new Request("http://localhost"), options(drafts.other))).json()).toEqual({ family: null });
  });
});
