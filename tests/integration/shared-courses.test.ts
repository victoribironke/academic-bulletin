import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Rule W16 on a real database: the department that owns a shared course
// writes its description, every open draft that uses it shows the same
// text, and other departments see it read-only. Uses its own codes (ZSH...).

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
import { GET as listCourses, POST as addCourse } from "@/app/api/courses/route";
import { PATCH as updateCourse } from "@/app/api/courses/[id]/route";
import { PUT as saveDescription } from "@/app/api/courses/[id]/description/route";
import { progressForDrafts } from "@/lib/submissions/section-status";

const ids = {
  school: "zsh-school",
  owners: "zsh-dept-owners",
  others: "zsh-dept-others",
  hodOwners: "zsh-hod-owners",
  hodOthers: "zsh-hod-others",
  programmeOwners: "zsh-prog-owners",
  programmeOthers: "zsh-prog-others",
  programmeReview: "zsh-prog-review",
  cycle: "zsh-cycle",
  archivedCycle: "zsh-archived",
  draftOwners: "zsh-draft-owners",
  draftOthers: "zsh-draft-others",
  draftReview: "zsh-draft-review",
  draftArchived: "zsh-draft-archived",
  shared: "zsh-101",
  ownCourse: "zsh-201",
  general: "zsh-gst-105",
};

const OLD_TEXT = { learningOutcomes: ["Explain the old ideas", "Describe the old ways", "List the old things"], courseContent: "The old content." };

const as = (userId: string) => {
  authState.userId = userId;
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) => ({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const rows = async (submissionId: string) => {
  const response = await listCourses(new Request(`http://localhost/api/courses?submissionId=${submissionId}`));
  expect(response.status).toBe(200);
  return (await response.json()) as Array<{ id: string; code: string; descriptionAccess: string; sharedOwner: string | null; sharedWithProgrammes: number }>;
};
const description = (courseId: string) =>
  prisma.courseDescription.findUnique({ where: { courseId }, select: { learningOutcomes: true, courseContent: true } });

describe("shared courses (W16)", () => {
  beforeAll(async () => {
    await prisma.school.create({ data: { id: ids.school, code: "ZSH", name: "School of Sharing Tests" } });
    await prisma.department.createMany({
      data: [
        { id: ids.owners, code: "ZSH-OWN", name: "Department of Owners", schoolId: ids.school },
        { id: ids.others, code: "ZSH-OTH", name: "Department of Others", schoolId: ids.school },
      ],
    });
    await prisma.user.createMany({
      data: [
        { id: ids.hodOwners, email: "zsh-owners@babcock.edu.ng", firstName: "Owner", lastName: "Head", role: "HOD", schoolId: ids.school, departmentId: ids.owners },
        { id: ids.hodOthers, email: "zsh-others@babcock.edu.ng", firstName: "Other", lastName: "Head", role: "HOD", schoolId: ids.school, departmentId: ids.others },
      ],
    });
    // Everyone acts from a sign-in that passed two-step verification (DEC18).
    await prisma.mfaVerification.createMany({
      data: [ids.hodOwners, ids.hodOthers].map((userId) => ({ userId, sessionId: `session-${userId}`, method: "AUTHENTICATOR" as const })),
    });
    await prisma.programme.createMany({
      data: [
        { id: ids.programmeOwners, code: "ZSH-OWN-A", name: "Owning Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.owners },
        { id: ids.programmeOthers, code: "ZSH-OTH-B", name: "Borrowing Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.others },
        { id: ids.programmeReview, code: "ZSH-OTH-C", name: "Reviewed Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.others },
      ],
    });
    await prisma.masterCourse.createMany({
      data: [
        { id: ids.shared, code: "ZSH 101", title: "Shared Foundations", units: 2, level: 100, semester: 1, ownership: "DEPARTMENT", ownerDeptId: ids.owners, ...OLD_TEXT },
        { id: ids.ownCourse, code: "ZSH 201", title: "Borrowers' Own Course", units: 2, level: 200, semester: 1, ownership: "DEPARTMENT", ownerDeptId: ids.others },
        { id: ids.general, code: "BU-GST 105", title: "Use of Library and Study Skills", units: 2, level: 100, semester: 1, ownership: "INSTITUTIONAL", type: "GST_BU" },
      ],
    });
    await prisma.programmeCourse.createMany({
      data: [ids.programmeOwners, ids.programmeOthers, ids.programmeReview].map((programmeId) => ({ programmeId, courseId: ids.shared })),
    });
    await prisma.reviewCycle.create({ data: { id: ids.cycle, name: "ZSH cycle", createdById: ids.hodOwners } });
    await prisma.reviewCycle.create({ data: { id: ids.archivedCycle, name: "ZSH archived", createdById: ids.hodOwners, isActive: false, archivedAt: new Date() } });
    const drafts: Array<[string, string, string, "DRAFT" | "IN_REVIEW"]> = [
      [ids.draftOwners, ids.programmeOwners, ids.cycle, "DRAFT"],
      [ids.draftOthers, ids.programmeOthers, ids.cycle, "DRAFT"],
      [ids.draftReview, ids.programmeReview, ids.cycle, "IN_REVIEW"],
      [ids.draftArchived, ids.programmeOthers, ids.archivedCycle, "DRAFT"],
    ];
    for (const [id, programmeId, cycleId, status] of drafts) {
      await prisma.submission.create({ data: { id, title: id, programmeId, cycleId, status, createdById: ids.hodOwners } });
      await prisma.course.create({
        data: {
          id: `${id}-zsh101`,
          submissionId: id,
          code: "ZSH 101",
          title: "Shared Foundations",
          units: 2,
          level: 100,
          semester: 1,
          masterCourseId: ids.shared,
          description: { create: { submissionId: id, ...OLD_TEXT } },
        },
      });
    }
    await prisma.course.create({
      data: { id: "zsh-others-gst", submissionId: ids.draftOthers, code: "BU-GST 105", title: "Use of Library and Study Skills", units: 2, level: 100, semester: 1, masterCourseId: ids.general },
    });
    await prisma.course.create({
      data: {
        id: "zsh-others-own",
        submissionId: ids.draftOthers,
        code: "ZSH 201",
        title: "Borrowers' Own Course",
        units: 2,
        level: 200,
        semester: 1,
        masterCourseId: ids.ownCourse,
        description: { create: { submissionId: ids.draftOthers, learningOutcomes: ["Plan a thing"], courseContent: "Their own words." } },
      },
    });
  });

  beforeEach(() => {
    authState.userId = null;
  });

  afterAll(async () => {
    const submissions = [ids.draftOwners, ids.draftOthers, ids.draftReview, ids.draftArchived];
    await prisma.submission.deleteMany({ where: { id: { in: submissions } } });
    await prisma.reviewCycle.deleteMany({ where: { id: { in: [ids.cycle, ids.archivedCycle] } } });
    await prisma.masterCourse.deleteMany({ where: { id: { in: [ids.shared, ids.ownCourse, ids.general] } } });
    await prisma.programme.deleteMany({ where: { id: { in: [ids.programmeOwners, ids.programmeOthers, ids.programmeReview] } } });
    await prisma.activityLog.deleteMany({ where: { actorId: { in: [ids.hodOwners, ids.hodOthers] } } });
    await prisma.mfaVerification.deleteMany({ where: { userId: { in: [ids.hodOwners, ids.hodOthers] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.hodOwners, ids.hodOthers] } } });
    await prisma.department.deleteMany({ where: { id: { in: [ids.owners, ids.others] } } });
    await prisma.school.deleteMany({ where: { id: ids.school } });
  });

  it("tells each draft who writes each course's description", async () => {
    as(ids.hodOthers);
    const others = await rows(ids.draftOthers);
    const byCode = Object.fromEntries(others.map((row) => [row.code, row]));
    expect(byCode["ZSH 101"]).toMatchObject({ descriptionAccess: "LOCKED", sharedOwner: "Department of Owners", sharedWithProgrammes: 3 });
    expect(byCode["BU-GST 105"]).toMatchObject({ descriptionAccess: "LOCKED", sharedOwner: null });
    expect(byCode["ZSH 201"]).toMatchObject({ descriptionAccess: "OWNER" });

    as(ids.hodOwners);
    const owners = await rows(ids.draftOwners);
    expect(owners.find((row) => row.code === "ZSH 101")).toMatchObject({ descriptionAccess: "OWNER" });
  });

  it("doesn't count a course another department writes in the Head's progress", async () => {
    const progress = (await progressForDrafts([ids.draftOthers])).get(ids.draftOthers)!;
    // ZSH 201 is the department's own and complete; ZSH 101 and BU-GST 105 aren't theirs.
    expect(progress.sections.find((section) => section.key === "descriptions")?.percentage).toBe(100);
  });

  it("refuses another department's change to the description, code or title", async () => {
    as(ids.hodOthers);
    const refused = await saveDescription(
      new Request("http://localhost", json({ learningOutcomes: ["Rewrite it"], courseContent: "Their version." })),
      params(`${ids.draftOthers}-zsh101`),
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "SHARED_COURSE_LOCKED" });

    const general = await saveDescription(
      new Request("http://localhost", json({ learningOutcomes: ["Rewrite it"], courseContent: "Their version." })),
      params("zsh-others-gst"),
    );
    expect(general.status).toBe(403);
    expect((await general.json()).error).toContain("General Education desk");

    const renamed = await updateCourse(
      new Request("http://localhost", { ...json({ title: "Borrowed Foundations" }), method: "PATCH" }),
      params(`${ids.draftOthers}-zsh101`),
    );
    expect(renamed.status).toBe(403);

    // Saving the table sends every row unchanged, and the programme's own
    // units (B14) are still its own.
    const units = await updateCourse(
      new Request("http://localhost", { ...json({ code: "ZSH 101", title: "Shared Foundations", units: 3 }), method: "PATCH" }),
      params(`${ids.draftOthers}-zsh101`),
    );
    expect(units.status).toBe(200);
    expect(await description(`${ids.draftOthers}-zsh101`)).toMatchObject(OLD_TEXT);
  });

  it("puts the owner's text on the Registry course and every open draft that uses it", async () => {
    as(ids.hodOwners);
    const next = { learningOutcomes: ["Explain the new ideas", "Apply the new methods", "Compare the new results"], courseContent: "The new content." };
    const saved = await saveDescription(new Request("http://localhost", json(next)), params(`${ids.draftOwners}-zsh101`));
    expect(saved.status).toBe(200);
    expect((await saved.json()).sharedWith).toEqual(["Borrowing Studies"]);

    expect(await prisma.masterCourse.findUnique({ where: { id: ids.shared }, select: { learningOutcomes: true, courseContent: true } })).toEqual(next);
    expect(await description(`${ids.draftOwners}-zsh101`)).toEqual(next);
    expect(await description(`${ids.draftOthers}-zsh101`)).toEqual(next);
    // A bulletin under review and an archived cycle stay as they were.
    expect(await description(`${ids.draftReview}-zsh101`)).toEqual(OLD_TEXT);
    expect(await description(`${ids.draftArchived}-zsh101`)).toEqual(OLD_TEXT);
    // The other programme's own units are untouched.
    expect((await prisma.course.findUnique({ where: { id: `${ids.draftOthers}-zsh101` } }))?.units).toBe(3);

    const log = await prisma.activityLog.findFirst({ where: { actorId: ids.hodOwners, action: "SHARED_COURSE_TEXT_UPDATED" } });
    expect(log?.description).toContain("ZSH 101");
  });

  it("starts a newly added Registry course with its shared text", async () => {
    as(ids.hodOthers);
    await prisma.course.delete({ where: { id: `${ids.draftOthers}-zsh101` } });
    const response = await addCourse(
      new Request("http://localhost/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: ids.draftOthers, code: "ZSH 101", title: "Shared Foundations", units: 2, level: 100, semester: 1, masterCourseId: ids.shared }),
      }),
    );
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.description).toMatchObject({ courseContent: "The new content." });
  });
});
