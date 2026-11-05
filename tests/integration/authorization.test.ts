import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ userId: null as string | null }));
const authSignOut = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const authAdmin = vi.hoisted(() => ({
  getUserById: vi.fn(async (id: string) => ({
    data: { user: { id, app_metadata: {} } },
    error: null,
  })),
  updateUserById: vi.fn(async () => ({ data: { user: {} }, error: null })),
  createUser: vi.fn(async ({ email }: { email: string }) => ({
    data: { user: { id: `created-${email}` } },
    error: null,
  })),
  deleteUser: vi.fn(async () => ({ data: {}, error: null })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// after() needs a real request scope; workflow emails aren't under test here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signOut: authSignOut,
      getUser: async () => ({
        data: {
          user: authState.userId
            ? { id: authState.userId, email: `${authState.userId}@example.edu` }
            : null,
        },
        error: null,
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: authAdmin } }),
}));

import prisma from "@/lib/prisma";
import {
  canAccessDepartment,
  canViewSubmission,
  canWriteSubmission,
  getApiUser,
  requireApiUser,
} from "@/lib/api-auth";
import { POST as createSchool } from "@/app/api/schools/route";
import { DELETE as deleteUser, PATCH as updateUser } from "@/app/api/users/[id]/route";
import { adminCreateUser } from "@/app/actions/admin";
import { GET as listCourses } from "@/app/api/courses/route";
import { POST as transitionSubmission } from "@/app/api/submissions/[id]/transition/route";
import { GET as getSubmission, PUT as updateSubmission } from "@/app/api/submissions/[id]/route";
import { GET as listComments, POST as createComment } from "@/app/api/submissions/[id]/comments/route";
import { POST as checkGrace } from "@/app/api/grace-check/route";
import { GET as listMasterCourses } from "@/app/api/master-courses/route";
import { PATCH as updateMasterCourse } from "@/app/api/master-courses/[id]/route";
import { canExportBulletin } from "@/lib/bulletin/access";
import { sendDailyDigests } from "@/lib/email/notifications";
import { getCcmasCatalogueSummary, syncCcmasCatalogue } from "@/lib/courses/ccmas-catalogue";
import { recordActivity } from "@/lib/activity-log";
import { GET as getCurrentUser } from "@/app/api/users/me/route";
import { POST as bulkImportStaff } from "@/app/api/staff/bulk/route";
import { POST as createStaff } from "@/app/api/staff/route";
import { PATCH as updateStaff } from "@/app/api/staff/[id]/route";
import { POST as bulkImportCourses } from "@/app/api/courses/bulk/route";
import { POST as bulkImportMasterCourses } from "@/app/api/master-courses/bulk/route";
import { GET as listSubmissions } from "@/app/api/submissions/route";
import { GET as listActivities } from "@/app/api/activity-log/route";
import { GET as getDashboardStats } from "@/app/api/dashboard/stats/route";
import { courseGraceContentHash } from "@/lib/courses/grace-compliance";
import { philosophyGraceHash } from "@/lib/submissions/submit-readiness";
import { DEFAULT_PHASE_OWNERS } from "@/lib/submissions/workflow";

const ids = {
  schoolA: "test-school-a",
  schoolB: "test-school-b",
  departmentA: "test-department-a",
  departmentB: "test-department-b",
  programmeA: "test-programme-a",
  programmeB: "test-programme-b",
  cycle: "test-cycle",
  submission: "test-submission",
  super: "test-super",
  admin: "test-admin",
  dean: "test-dean",
  hod: "test-hod",
  coordinator: "test-programme-coordinator",
  inactive: "test-inactive",
};

async function clearFixtures() {
  await prisma.activityLog.deleteMany({});
  await prisma.courseDescription.deleteMany({});
  await prisma.graceAssessment.deleteMany({});
  await prisma.course.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.phaseTransition.deleteMany({});
  await prisma.submissionContent.deleteMany({});
  await prisma.submission.deleteMany({});
  await prisma.reviewCycle.deleteMany({});
  await prisma.programmeCourse.deleteMany({});
  await prisma.masterCourse.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.programme.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.department.deleteMany({});
  await prisma.school.deleteMany({});
}

beforeAll(async () => {
  await clearFixtures();

  await prisma.school.createMany({
    data: [
      { id: ids.schoolA, name: "Test School A", code: "TSA" },
      { id: ids.schoolB, name: "Test School B", code: "TSB" },
    ],
  });
  await prisma.department.createMany({
    data: [
      {
        id: ids.departmentA,
        name: "Test Department A",
        code: "TDA",
        schoolId: ids.schoolA,
      },
      {
        id: ids.departmentB,
        name: "Test Department B",
        code: "TDB",
        schoolId: ids.schoolB,
      },
    ],
  });
  await prisma.programme.createMany({
    data: [
      {
        id: ids.programmeA,
        name: "Test Programme A",
        code: "TPA",
        departmentId: ids.departmentA,
      },
      {
        id: ids.programmeB,
        name: "Test Programme B",
        code: "TPB",
        departmentId: ids.departmentB,
      },
    ],
  });
  await prisma.user.createMany({
    data: [
      {
        id: ids.super,
        email: `${ids.super}@example.edu`,
        firstName: "Super",
        lastName: "Admin",
        role: "SUPER_ADMIN",
      },
      {
        id: ids.admin,
        email: `${ids.admin}@example.edu`,
        firstName: "Academic",
        lastName: "Admin",
        role: "ADMIN",
      },
      {
        id: ids.dean,
        email: `${ids.dean}@example.edu`,
        firstName: "Test",
        lastName: "Dean",
        role: "DEAN",
        schoolId: ids.schoolA,
      },
      {
        id: ids.hod,
        email: `${ids.hod}@example.edu`,
        firstName: "Test",
        lastName: "Hod",
        role: "HOD",
        schoolId: ids.schoolA,
        departmentId: ids.departmentA,
      },
      {
        id: ids.coordinator,
        email: `${ids.coordinator}@example.edu`,
        firstName: "Programme",
        lastName: "Coordinator",
        role: "PROGRAMME_COORDINATOR",
        schoolId: ids.schoolA,
        departmentId: ids.departmentA,
      },
      {
        id: ids.inactive,
        email: `${ids.inactive}@example.edu`,
        firstName: "Inactive",
        lastName: "User",
        role: "HOD",
        isActive: false,
        departmentId: ids.departmentA,
      },
    ],
  });
  await prisma.userProgramme.create({
    data: { userId: ids.coordinator, programmeId: ids.programmeA },
  });
  await prisma.reviewCycle.create({
    data: {
      id: ids.cycle,
      name: "Test Cycle",
      createdById: ids.super,
    },
  });
  await prisma.submission.create({
    data: {
      id: ids.submission,
      title: "Test Submission",
      programmeId: ids.programmeA,
      createdById: ids.hod,
      cycleId: ids.cycle,
      status: "DRAFT",
    },
  });
});

beforeEach(() => {
  authState.userId = null;
  authAdmin.getUserById.mockClear();
  authAdmin.updateUserById.mockClear();
  authAdmin.createUser.mockClear();
  authAdmin.deleteUser.mockClear();
  authSignOut.mockClear();
});

afterAll(async () => {
  await clearFixtures();
  await prisma.$disconnect();
});

const readyPhilosophy = Array.from(
  { length: 160 },
  (_, index) => `principle${index + 1}`,
).join(" ");

/**
 * Fills a draft in Department A with everything Submit requires: the
 * programme sections, a GRACE pass for the saved philosophy, a staff member,
 * and (unless the test brings its own) one GRACE-compliant course. The stated
 * total units always match the courses on the draft.
 */
async function prepareDraftForSubmit(
  submissionId: string,
  options: { course?: boolean } = {},
) {
  await prisma.staff.upsert({
    where: { id: "ready-staff-a" },
    update: {},
    create: {
      id: "ready-staff-a",
      title: "DR",
      gender: "FEMALE",
      surname: "Example",
      firstName: "Ada",
      highestQualification: "PHD",
      academicRank: "SENIOR_LECTURER",
      departmentId: ids.departmentA,
    },
  });

  if (options.course !== false) {
    const courseContent = Array.from(
      { length: 150 },
      (_, index) => `topic${index + 1}`,
    ).join(" ");
    const learningOutcomes = ["Explain the core ideas of the course"];
    const course = await prisma.course.create({
      data: {
        code: "RDY 101",
        title: "Ready Course",
        units: 3,
        semester: 1,
        level: 100,
        submissionId,
      },
    });
    const contentHash = courseGraceContentHash({
      title: course.title,
      learningOutcomes,
      courseContent,
    })!;
    const result = { passed: true, scores: { G: 3, R: 3, A: 3, C: 3, E: 3 } };
    await prisma.graceAssessment.upsert({
      where: { contentHash },
      update: {},
      create: {
        contentHash,
        title: course.title,
        courseContent,
        learningOutcomes,
        status: "COMPLIANT",
        result,
        checkedAt: new Date(),
      },
    });
    await prisma.courseDescription.create({
      data: {
        courseId: course.id,
        submissionId,
        courseContent,
        learningOutcomes,
        graceContentHash: contentHash,
        graceStatus: "COMPLIANT",
        gracePass: true,
        graceResult: result,
        graceCheckedAt: new Date(),
      },
    });
  }

  const { _sum } = await prisma.course.aggregate({
    where: { submissionId },
    _sum: { units: true },
  });
  const content = {
    philosophy: readyPhilosophy,
    philosophyGracePass: true,
    philosophyGrace: { passed: true, contentHash: philosophyGraceHash(readyPhilosophy) },
    mission: "To form graduates of character.",
    vision: "A leading programme.",
    utmeRequirements: "Five credit passes.",
    graduationRequirements: "Pass every required course.",
    minimumDuration: "4 years",
    minimumCGPA: 2.5,
    totalUnits: _sum.units ?? 0,
  };
  await prisma.submissionContent.upsert({
    where: { submissionId },
    update: content,
    create: { submissionId, ...content },
  });
}

describe("active account enforcement", () => {
  it("rejects missing and inactive sessions", async () => {
    expect((await requireApiUser()).ok).toBe(false);

    authState.userId = ids.inactive;
    expect(await getApiUser()).toBeNull();
    expect((await requireApiUser()).ok).toBe(false);
  });

  it("returns an active session user", async () => {
    authState.userId = ids.hod;
    const user = await getApiUser();
    expect(user).toMatchObject({ id: ids.hod, role: "HOD", isActive: true });
  });

  it("does not auto-assign a role to an unprovisioned auth account", async () => {
    authState.userId = "unknown-auth-user";

    const response = await getCurrentUser();
    expect(response.status).toBe(403);
    expect(authSignOut).toHaveBeenCalledWith({ scope: "global" });
    expect(
      await prisma.user.findUnique({ where: { id: "unknown-auth-user" } }),
    ).toBeNull();
  });
});

describe("academic-unit authorization", () => {
  it("scopes HOD and Dean access to their assigned units", async () => {
    authState.userId = ids.hod;
    const hod = (await getApiUser())!;
    expect(await canAccessDepartment(hod, ids.departmentA)).toBe(true);
    expect(await canAccessDepartment(hod, ids.departmentB)).toBe(false);
    expect(await canViewSubmission(hod, ids.submission)).toBe(true);

    authState.userId = ids.dean;
    const dean = (await getApiUser())!;
    expect(await canAccessDepartment(dean, ids.departmentA)).toBe(true);
    expect(await canAccessDepartment(dean, ids.departmentB)).toBe(false);
  });

  it("limits programme coordinators to their assigned programmes", async () => {
    authState.userId = ids.coordinator;
    const coordinator = (await getApiUser())!;

    expect(coordinator.programmeIds).toEqual([ids.programmeA]);
    expect(await canAccessDepartment(coordinator, ids.departmentA)).toBe(true);
    expect(await canAccessDepartment(coordinator, ids.departmentB)).toBe(false);
    expect(await canViewSubmission(coordinator, ids.submission)).toBe(true);
    expect(await canWriteSubmission(coordinator, ids.submission)).toBe(true);

    const outside = await prisma.submission.create({
      data: {
        title: "Coordinator Access Boundary",
        programmeId: ids.programmeB,
        createdById: ids.super,
        cycleId: ids.cycle,
        status: "DRAFT",
      },
    });
    try {
      expect(await canViewSubmission(coordinator, outside.id)).toBe(false);
      expect(await canWriteSubmission(coordinator, outside.id)).toBe(false);
    } finally {
      await prisma.submission.delete({ where: { id: outside.id } });
    }
  });

  it("scopes programme coordinator dashboard totals to assigned programmes", async () => {
    const outside = await prisma.submission.create({
      data: {
        title: "Outside Dashboard Scope",
        programmeId: ids.programmeB,
        createdById: ids.super,
        cycleId: ids.cycle,
        status: "DRAFT",
      },
    });
    authState.userId = ids.coordinator;
    try {
      const response = await getDashboardStats(
        new Request("http://localhost/api/dashboard/stats"),
      );
      expect(response.status).toBe(200);
      expect((await response.json()).submissions.total).toBe(1);
    } finally {
      await prisma.submission.delete({ where: { id: outside.id } });
    }
  });

  it("allows edits in draft and corrections-required states only", async () => {
    authState.userId = ids.hod;
    const hod = (await getApiUser())!;
    expect(await canWriteSubmission(hod, ids.submission)).toBe(true);

    await prisma.submission.update({
      where: { id: ids.submission },
      data: { status: "CORRECTIONS_REQUIRED" },
    });
    expect(await canWriteSubmission(hod, ids.submission)).toBe(true);

    await prisma.submission.update({
      where: { id: ids.submission },
      data: { status: "IN_REVIEW" },
    });
    expect(await canWriteSubmission(hod, ids.submission)).toBe(false);

    await prisma.submission.update({
      where: { id: ids.submission },
      data: { status: "DRAFT" },
    });
  });
});

describe("submission progress visibility", () => {
  it("includes content completion progress in the admin submissions list", async () => {
    authState.userId = ids.admin;

    await prisma.submissionContent.create({
      data: {
        submissionId: ids.submission,
        programmeInfo: {
          deanImageUrl: "https://example.edu/dean.jpg",
          hodImageUrl: "https://example.edu/hod.jpg",
        },
        philosophy: "A complete philosophy.",
        mission: "A complete mission.",
        vision: "A complete vision.",
        objectives: ["Develop capable graduates"],
        uniqueFeatures: ["Practice-led teaching"],
        employability: "Professional practice",
        utmeRequirements: "Five credits.",
        directEntryRequirements: "Direct entry requirements.",
        transferRequirements: "Transfer requirements.",
        minimumDuration: "4 years",
        graduationRequirements: "Complete the required credits.",
        minimumCGPA: 2.5,
        totalUnits: 154,
        sectionF: { content: "Programme regulations." },
        sectionG: { content: "Summary of changes." },
      },
    });
    const staff = await prisma.staff.create({
      data: {
        departmentId: ids.departmentA,
        title: "DR",
        gender: "FEMALE",
        surname: "Progress",
        firstName: "Tester",
        highestQualification: "PHD",
        academicRank: "LECTURER_I",
        type: "ACADEMIC",
      },
    });
    const course = await prisma.course.create({
      data: {
        submissionId: ids.submission,
        code: "TST 101",
        title: "Progress Testing",
        units: 2,
        semester: 1,
        level: 100,
        description: {
          create: {
            submissionId: ids.submission,
            learningOutcomes: ["Explain progress tracking"],
            courseContent: "Progress tracking fundamentals.",
          },
        },
      },
    });

    try {
      const response = await listSubmissions(
        new NextRequest(`http://localhost/api/submissions?cycleId=${ids.cycle}`),
      );
      expect(response.status).toBe(200);
      const submissions = await response.json();
      expect(submissions).toHaveLength(1);
      expect(submissions[0].progress).toMatchObject({
        percentage: 100,
        completedSections: 8,
        totalSections: 8,
      });
      expect(submissions[0].content).toBeUndefined();
      expect(submissions[0].courses).toBeUndefined();
    } finally {
      await prisma.courseDescription.deleteMany({ where: { courseId: course.id } });
      await prisma.course.delete({ where: { id: course.id } });
      await prisma.staff.delete({ where: { id: staff.id } });
      await prisma.submissionContent.delete({
        where: { submissionId: ids.submission },
      });
    }
  });
});

describe("route authorization", () => {
  it("blocks unauthenticated and non-admin school creation", async () => {
    const request = () =>
      new NextRequest("http://localhost/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Blocked School", code: "BLK" }),
      });

    expect((await createSchool(request())).status).toBe(401);
    authState.userId = ids.hod;
    expect((await createSchool(request())).status).toBe(403);
  });

  it("allows an administrator to create a school", async () => {
    authState.userId = ids.admin;
    const response = await createSchool(
      new NextRequest("http://localhost/api/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Created School", code: "CRT" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await prisma.school.count({ where: { code: "CRT" } })).toBe(1);

    const activity = await prisma.activityLog.findFirst({
      where: { action: "SCHOOL_CREATED", actorId: ids.admin },
    });
    expect(activity).toMatchObject({
      entityType: "SCHOOL",
      description: expect.stringContaining("Created School"),
    });

    const activityResponse = await listActivities(
      new NextRequest("http://localhost/api/activity-log?action=SCHOOL_CREATED"),
    );
    expect(activityResponse.status).toBe(200);
    expect((await activityResponse.json()).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "SCHOOL_CREATED" }),
      ]),
    );
  });

  it("deactivates and bans a user, making API authentication fail", async () => {
    authState.userId = ids.super;
    const response = await updateUser(
      new NextRequest(`http://localhost/api/users/${ids.hod}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      { params: Promise.resolve({ id: ids.hod }) },
    );

    expect(response.status).toBe(200);
    expect(authAdmin.updateUserById).toHaveBeenCalledWith(
      ids.hod,
      expect.objectContaining({
        ban_duration: "876000h",
        app_metadata: expect.objectContaining({ account_active: false }),
      }),
    );
    expect(
      await prisma.user.findUnique({
        where: { id: ids.hod },
        select: { isActive: true },
      }),
    ).toEqual({ isActive: false });

    authState.userId = ids.hod;
    expect(await getApiUser()).toBeNull();

    authState.userId = ids.super;
    await updateUser(
      new NextRequest(`http://localhost/api/users/${ids.hod}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      }),
      { params: Promise.resolve({ id: ids.hod }) },
    );
  });

  it("turns an existing user into a programme coordinator only with programmes", async () => {
    authState.userId = ids.admin;
    const user = await prisma.user.create({
      data: {
        id: "test-existing-user",
        email: "existing.user@babcock.edu.ng",
        firstName: "Existing",
        lastName: "User",
        role: "HOD",
        departmentId: ids.departmentA,
      },
    });
    const patch = (body: object) =>
      updateUser(
        new NextRequest(`http://localhost/api/users/${user.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id: user.id }) },
      );

    try {
      // No programmes chosen: refused, nothing changes.
      expect(
        (await patch({ role: "PROGRAMME_COORDINATOR", departmentId: ids.departmentA, programmeIds: [] }))
          .status,
      ).toBe(400);
      expect((await prisma.user.findUnique({ where: { id: user.id } }))?.role).toBe("HOD");

      // A school that doesn't own the department is still refused.
      expect(
        (
          await patch({
            role: "PROGRAMME_COORDINATOR",
            schoolId: ids.schoolB,
            departmentId: ids.departmentA,
            programmeIds: [ids.programmeA],
          })
        ).status,
      ).toBe(400);

      // No school sent (this account never had one): taken from the department.
      const response = await patch({
        role: "PROGRAMME_COORDINATOR",
        departmentId: ids.departmentA,
        programmeIds: [ids.programmeA],
      });
      expect(response.status).toBe(200);
      expect(
        await prisma.user.findUnique({
          where: { id: user.id },
          select: {
            role: true,
            schoolId: true,
            programmeAssignments: { select: { programmeId: true } },
          },
        }),
      ).toEqual({
        role: "PROGRAMME_COORDINATOR",
        schoolId: ids.schoolA,
        programmeAssignments: [{ programmeId: ids.programmeA }],
      });
    } finally {
      await prisma.userProgramme.deleteMany({ where: { userId: user.id } });
      await prisma.activityLog.deleteMany({ where: { entityId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it("lets admins rename users and users rename themselves, but nothing more", async () => {
    const patch = (id: string, body: object) =>
      updateUser(
        new NextRequest(`http://localhost/api/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ id }) },
      );

    // An admin renames an HOD; spelling is kept as typed.
    authState.userId = ids.admin;
    const renamed = await patch(ids.hod, { firstName: "  Seun ", lastName: "McDonald-O'Neil" });
    expect(renamed.status).toBe(200);
    expect(
      await prisma.user.findUnique({
        where: { id: ids.hod },
        select: { firstName: true, lastName: true },
      }),
    ).toEqual({ firstName: "Seun", lastName: "McDonald-O'Neil" });

    // Empty names are rejected.
    expect((await patch(ids.hod, { firstName: "   " })).status).toBe(400);

    // An HOD can fix their own name, but can't change anyone else's
    // or anything else about themselves.
    authState.userId = ids.hod;
    expect((await patch(ids.hod, { firstName: "Test" , lastName: "Hod" })).status).toBe(200);
    expect((await patch(ids.dean, { firstName: "Changed" })).status).toBe(403);
    expect((await patch(ids.hod, { firstName: "Test", role: "ADMIN" })).status).toBe(403);
  });

  it("deletes users without history and refuses those with history", async () => {
    const del = (id: string) =>
      deleteUser(new NextRequest(`http://localhost/api/users/${id}`, { method: "DELETE" }), {
        params: Promise.resolve({ id }),
      });

    await prisma.user.create({
      data: {
        id: "test-to-delete",
        email: "test-to-delete@example.edu",
        firstName: "Temporary",
        lastName: "Person",
        role: "HOD",
        departmentId: ids.departmentA,
        schoolId: ids.schoolA,
      },
    });

    // Only Super Admins may delete.
    authState.userId = ids.admin;
    expect((await del("test-to-delete")).status).toBe(403);

    authState.userId = ids.super;
    // Not yourself.
    expect((await del(ids.super)).status).toBe(403);
    // Not someone who created a submission: deactivate them instead.
    expect((await del(ids.hod)).status).toBe(409);
    expect(await prisma.user.findUnique({ where: { id: ids.hod } })).not.toBeNull();

    // Someone with no history is removed, along with their sign-in account.
    expect((await del("test-to-delete")).status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: "test-to-delete" } })).toBeNull();
    expect(authAdmin.deleteUser).toHaveBeenCalledWith("test-to-delete");
  });

  it("creates one role and sends login instructions by email", async () => {
    authState.userId = ids.super;
    const form = new FormData();
    form.set("firstName", "Invited");
    form.set("lastName", "User");
    form.set("email", "INVITED.USER@example.edu");
    form.set("role", "DEAN");
    form.set("schoolId", ids.schoolA);
    form.set("departmentId", "none");

    const result = await adminCreateUser(null, form);
    expect(result).toEqual({
      success: true,
      email: "invited.user@example.edu",
      // Resend isn't configured in tests, so no access email goes out.
      emailSent: false,
    });
    // The account is created directly (no invite, no password) so a Google
    // sign-in with the same email links to it.
    expect(authAdmin.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "invited.user@example.edu",
        email_confirm: true,
      }),
    );
    expect(authAdmin.createUser.mock.calls[0][0]).not.toHaveProperty("password");
    expect(
      await prisma.user.findUnique({
        where: { email: "invited.user@example.edu" },
        select: { role: true, schoolId: true, departmentId: true },
      }),
    ).toEqual({
      role: "DEAN",
      schoolId: ids.schoolA,
      departmentId: null,
    });
  });

  it("creates a programme coordinator with explicit programme assignments", async () => {
    authState.userId = ids.super;
    const form = new FormData();
    form.set("firstName", "Second");
    form.set("lastName", "Coordinator");
    form.set("email", "second.coordinator@example.edu");
    form.set("role", "PROGRAMME_COORDINATOR");
    form.set("schoolId", ids.schoolA);
    form.set("departmentId", ids.departmentA);
    form.append("programmeIds", ids.programmeA);

    const result = await adminCreateUser(null, form);
    expect(result).toMatchObject({ success: true });
    expect(
      await prisma.user.findUnique({
        where: { email: "second.coordinator@example.edu" },
        include: { programmeAssignments: true },
      }),
    ).toMatchObject({
      role: "PROGRAMME_COORDINATOR",
      departmentId: ids.departmentA,
      programmeAssignments: [
        expect.objectContaining({ programmeId: ids.programmeA }),
      ],
    });
  });

  it("returns every persisted course-detail field", async () => {
    authState.userId = ids.hod;
    const course = await prisma.course.create({
      data: {
        code: "TST 101",
        title: "Test Course",
        units: 3,
        semester: 1,
        level: 100,
        submissionId: ids.submission,
      },
    });
    const learningOutcomes = ["Test an outcome"];
    const courseContent = "Detailed course content";
    const contentHash = courseGraceContentHash({
      title: course.title,
      learningOutcomes,
      courseContent,
    })!;
    const result = { passed: true, scores: { G: 4 } };
    await prisma.graceAssessment.create({
      data: {
        contentHash,
        title: course.title,
        learningOutcomes,
        courseContent,
        status: "COMPLIANT",
        result,
        checkedAt: new Date(),
      },
    });
    await prisma.courseDescription.create({
      data: {
        submissionId: ids.submission,
        courseId: course.id,
        learningOutcomes,
        courseContent,
        labWork: "Practical work",
        entrepreneurialAspect: "Commercial application",
        gracePass: true,
        graceResult: result,
        graceStatus: "COMPLIANT",
        graceContentHash: contentHash,
        graceCheckedAt: new Date(),
      },
    });

    const response = await listCourses(
      new Request(
        `http://localhost/api/courses?submissionId=${ids.submission}`,
      ),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body[0].description).toMatchObject({
      entrepreneurialAspect: "Commercial application",
      gracePass: true,
      graceResult: { passed: true, scores: { G: 4 } },
      graceStatus: "COMPLIANT",
    });
  });

  it("derives transitions and the audit actor entirely on the server", async () => {
    authState.userId = ids.admin;
    await prisma.submission.update({
      where: { id: ids.submission },
      data: { status: "IN_REVIEW", currentPhase: 4 },
    });

    const response = await transitionSubmission(
      new NextRequest(
        `http://localhost/api/submissions/${ids.submission}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "REJECT",
            remarks: "Correct the learning outcomes",
            performedById: ids.hod,
            toPhase: 11,
          }),
        },
      ),
      { params: Promise.resolve({ id: ids.submission }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.submission).toMatchObject({
      currentPhase: 1,
      status: "CORRECTIONS_REQUIRED",
    });
    expect(payload.transition).toMatchObject({
      performedById: ids.admin,
      toPhase: 1,
    });

    await prisma.submission.update({
      where: { id: ids.submission },
      data: { status: "DRAFT", currentPhase: 1 },
    });
  });

  it("hands work from Department to School to Academic Planning without duplicate approval", async () => {
    const cycleId = "seamless-handoff-cycle";
    const submissionId = "seamless-handoff-submission";
    await prisma.reviewCycle.create({
      data: { id: cycleId, name: "Seamless Handoff", createdById: ids.super },
    });
    await prisma.submission.create({
      data: {
        id: submissionId,
        title: "Seamless Handoff Submission",
        programmeId: ids.programmeA,
        createdById: ids.hod,
        cycleId,
      },
    });
    await prepareDraftForSubmit(submissionId);

    const transition = (userId: string, action: string, remarks?: string) => {
      authState.userId = userId;
      return transitionSubmission(
        new NextRequest(
          `http://localhost/api/submissions/${submissionId}/transition`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, remarks }),
          },
        ),
        { params: Promise.resolve({ id: submissionId }) },
      );
    };

    try {
      const departmentSubmit = await transition(ids.hod, "SUBMIT");
      expect(departmentSubmit.status).toBe(200);
      expect((await departmentSubmit.json()).submission).toMatchObject({
        currentPhase: 2,
        status: "IN_REVIEW",
      });

      // Academic Planning is not an extra approval layer before the School.
      expect((await transition(ids.admin, "APPROVE")).status).toBe(403);

      const schoolApproval = await transition(ids.dean, "APPROVE");
      expect(schoolApproval.status).toBe(200);
      expect((await schoolApproval.json()).submission).toMatchObject({
        currentPhase: 3,
        status: "IN_REVIEW",
      });

      // Once it reaches Academic Planning, the Dean's stage is complete.
      expect((await transition(ids.dean, "APPROVE")).status).toBe(403);

      const returnedToSchool = await transition(
        ids.admin,
        "RETURN",
        "Please confirm the School-level details.",
      );
      expect(returnedToSchool.status).toBe(200);
      expect((await returnedToSchool.json()).submission).toMatchObject({
        currentPhase: 2,
        status: "CORRECTIONS_REQUIRED",
      });
      authState.userId = ids.hod;
      expect(await canWriteSubmission((await getApiUser())!, submissionId)).toBe(
        false,
      );
      authState.userId = ids.dean;
      expect(await canWriteSubmission((await getApiUser())!, submissionId)).toBe(
        true,
      );

      expect((await transition(ids.hod, "SUBMIT")).status).toBe(403);
      const schoolResubmit = await transition(ids.dean, "SUBMIT");
      expect(schoolResubmit.status).toBe(200);
      expect((await schoolResubmit.json()).submission).toMatchObject({
        currentPhase: 3,
        status: "IN_REVIEW",
      });

      const academicPlanningApproval = await transition(ids.admin, "APPROVE");
      expect(academicPlanningApproval.status).toBe(200);
      expect((await academicPlanningApproval.json()).submission).toMatchObject({
        currentPhase: 4,
        status: "IN_REVIEW",
      });

      const returnedWithinAcademicPlanning = await transition(
        ids.admin,
        "RETURN",
        "Update the consolidation notes.",
      );
      expect(returnedWithinAcademicPlanning.status).toBe(200);
      authState.userId = ids.admin;
      expect(await canWriteSubmission((await getApiUser())!, submissionId)).toBe(
        true,
      );
      expect((await transition(ids.admin, "SUBMIT")).status).toBe(200);
    } finally {
      await prisma.activityLog.deleteMany({ where: { entityId: submissionId } });
      await prisma.submission.deleteMany({ where: { id: submissionId } });
      await prisma.reviewCycle.deleteMany({ where: { id: cycleId } });
    }
  });

  it("blocks submission until every current course description is compliant", async () => {
    const cycleId = "grace-gate-cycle";
    const submissionId = "grace-gate-submission";
    const courseContent = Array.from(
      { length: 150 },
      (_, index) => `course${index + 1}`,
    ).join(" ");
    const learningOutcomes = ["Apply the course knowledge responsibly"];

    await prisma.reviewCycle.create({
      data: { id: cycleId, name: "GRACE Gate Cycle", createdById: ids.super },
    });
    await prisma.submission.create({
      data: {
        id: submissionId,
        title: "GRACE Gate Submission",
        programmeId: ids.programmeA,
        createdById: ids.hod,
        cycleId,
      },
    });
    const course = await prisma.course.create({
      data: {
        code: "GRC 101",
        title: "GRACE Gate Course",
        units: 2,
        semester: 1,
        level: 100,
        submissionId,
      },
    });
    const contentHash = courseGraceContentHash({
      title: course.title,
      learningOutcomes,
      courseContent,
    })!;
    await prisma.graceAssessment.create({
      data: {
        contentHash,
        title: course.title,
        courseContent,
        learningOutcomes,
      },
    });
    await prisma.courseDescription.create({
      data: {
        courseId: course.id,
        submissionId,
        courseContent,
        learningOutcomes,
        graceContentHash: contentHash,
      },
    });
    // Everything else is complete, so only the course's GRACE state decides.
    await prepareDraftForSubmit(submissionId, { course: false });

    authState.userId = ids.hod;
    const submit = () =>
      transitionSubmission(
        new NextRequest(
          `http://localhost/api/submissions/${submissionId}/transition`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "SUBMIT" }),
          },
        ),
        { params: Promise.resolve({ id: submissionId }) },
      );

    try {
      const pending = await submit();
      expect(pending.status).toBe(409);
      expect(await pending.json()).toMatchObject({
        code: "GRACE_COMPLIANCE_REQUIRED",
        blockers: { pending: ["GRC 101"] },
      });

      // Saving the bulletin can't be used to skip the workflow and GRACE.
      for (const status of ["IN_REVIEW", "APPROVED"]) {
        const bypass = await updateSubmission(
          new NextRequest(`http://localhost/api/submissions/${submissionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }),
          { params: Promise.resolve({ id: submissionId }) },
        );
        expect(bypass.status).toBe(400);
      }
      expect(
        await prisma.submission.findUniqueOrThrow({
          where: { id: submissionId },
          select: { status: true },
        }),
      ).toEqual({ status: "DRAFT" });

      const result = { passed: true, scores: { G: 3, R: 3, A: 3, C: 3, E: 3 } };
      await prisma.$transaction([
        prisma.graceAssessment.update({
          where: { contentHash },
          data: { status: "COMPLIANT", result, checkedAt: new Date() },
        }),
        prisma.courseDescription.update({
          where: { courseId: course.id },
          data: {
            graceStatus: "COMPLIANT",
            gracePass: true,
            graceResult: result,
            graceCheckedAt: new Date(),
          },
        }),
      ]);
      await prisma.courseDescription.update({
        where: { courseId: course.id },
        data: { courseContent: `${courseContent} changed` },
      });

      const changed = await submit();
      expect(changed.status).toBe(409);
      expect(await changed.json()).toMatchObject({
        blockers: { changed: ["GRC 101"] },
      });

      await prisma.courseDescription.update({
        where: { courseId: course.id },
        data: { courseContent },
      });
      expect((await submit()).status).toBe(200);
    } finally {
      await prisma.submission.deleteMany({ where: { id: submissionId } });
      await prisma.reviewCycle.deleteMany({ where: { id: cycleId } });
    }
  });

  it("blocks transition attempts outside the user's academic unit", async () => {
    const outsideSubmission = await prisma.submission.create({
      data: {
        title: "Outside Department Submission",
        programmeId: ids.programmeB,
        createdById: ids.super,
        cycleId: ids.cycle,
        status: "IN_REVIEW",
      },
    });
    authState.userId = ids.hod;

    const response = await transitionSubmission(
      new NextRequest(
        `http://localhost/api/submissions/${outsideSubmission.id}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "RETURN",
            remarks: "Attempted out-of-scope change",
          }),
        },
      ),
      { params: Promise.resolve({ id: outsideSubmission.id }) },
    );

    expect(response.status).toBe(403);
  });

  it("uses the signed-in user as comment author", async () => {
    authState.userId = ids.hod;
    const response = await createComment(
      new NextRequest(
        `http://localhost/api/submissions/${ids.submission}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: "Please clarify this section",
            type: "QUESTION",
            authorId: ids.admin,
          }),
        },
      ),
      { params: Promise.resolve({ id: ids.submission }) },
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ authorId: ids.hod });
  });

  it("rejects mismatched programme and submission export scopes", async () => {
    authState.userId = ids.hod;
    const hod = (await getApiUser())!;

    expect(
      await canExportBulletin(hod, {
        level: "department",
        submissionId: ids.submission,
        programmeId: ids.programmeA,
      }),
    ).toBe(true);
    expect(
      await canExportBulletin(hod, {
        level: "department",
        submissionId: ids.submission,
        programmeId: ids.programmeB,
      }),
    ).toBe(false);
  });

  it("lists university-wide courses in the registry import source", async () => {
    authState.userId = ids.hod;
    await prisma.masterCourse.create({
      data: {
        code: "GST 101",
        title: "University-wide Course",
        units: 2,
        type: "GENERAL",
        ownership: "INSTITUTIONAL",
        level: 100,
        semester: 1,
        discoverable: true,
      },
    });

    const response = await listMasterCourses(
      new Request("http://localhost/api/master-courses?discoverable=true"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "GST 101",
          ownership: "INSTITUTIONAL",
        }),
      ]),
    );
  });

  it("pages and searches the Registry on the server", async () => {
    authState.userId = ids.admin;
    await prisma.masterCourse.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        code: `PGN ${String(101 + i)}`,
        title: `Paging Course ${i + 1}`,
        units: 2,
        type: "CORE" as const,
        ownership: "INSTITUTIONAL" as const,
        level: 100,
        semester: 1,
        discoverable: true,
      })),
    });

    const firstPage = await listMasterCourses(
      new Request("http://localhost/api/master-courses?page=1&q=paging%20course"),
    );
    expect(firstPage.status).toBe(200);
    const first = await firstPage.json();
    expect(first).toMatchObject({ total: 30, page: 1, pageSize: 25, pageCount: 2 });
    expect(first.items).toHaveLength(25);

    const secondPage = await listMasterCourses(
      new Request("http://localhost/api/master-courses?page=2&q=PGN"),
    );
    const second = await secondPage.json();
    expect(second.items).toHaveLength(5);
    const firstCodes = new Set(first.items.map((c: { code: string }) => c.code));
    expect(second.items.some((c: { code: string }) => firstCodes.has(c.code))).toBe(false);

    const summary = await listMasterCourses(
      new Request("http://localhost/api/master-courses?fields=summary&q=PGN"),
    );
    const summaryRows = await summary.json();
    expect(summaryRows).toHaveLength(30);
    expect(Object.keys(summaryRows[0]).sort()).toEqual(
      ["code", "id", "level", "semester", "title", "type", "units"],
    );

    await prisma.masterCourse.deleteMany({ where: { code: { startsWith: "PGN " } } });
  });

  it("automatically preloads the central GST pool into an HoD submission", async () => {
    authState.userId = ids.hod;
    await prisma.submission.update({
      where: { id: ids.submission },
      data: { status: "DRAFT", currentPhase: 1 },
    });
    const masterCourse = await prisma.masterCourse.create({
      data: {
        code: "GST 111",
        title: "Communication in English",
        units: 2,
        type: "GST_NUC",
        ownership: "INSTITUTIONAL",
        level: 100,
        semester: 1,
        description: "Shared course content from the central GST pool.",
        learningOutcomes: ["Communicate effectively in an academic setting"],
        courseContent: "Shared course content from the central GST pool.",
        ownerDeptId: ids.departmentA,
        discoverable: true,
      },
    });

    const response = await listCourses(
      new Request(
        `http://localhost/api/courses?submissionId=${ids.submission}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "GST 111",
          masterCourse: expect.objectContaining({
            ownership: "INSTITUTIONAL",
          }),
          description: expect.objectContaining({
            courseContent: "Shared course content from the central GST pool.",
          }),
        }),
      ]),
    );
    expect(
      await prisma.programmeCourse.findUnique({
        where: {
          programmeId_courseId: {
            programmeId: ids.programmeA,
            courseId: (
              await prisma.masterCourse.findUniqueOrThrow({
                where: { code: "GST 111" },
              })
            ).id,
          },
        },
      }),
    ).not.toBeNull();

    const updated = await updateMasterCourse(
      new Request(`http://localhost/api/master-courses/${masterCourse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learningOutcomes: ["Write and present clearly for different audiences"],
          courseContent: "Updated centrally by the hosting department.",
        }),
      }),
      { params: Promise.resolve({ id: masterCourse.id }) },
    );
    expect(updated.status).toBe(200);
    expect(
      await prisma.course.findUnique({
        where: {
          code_submissionId: {
            code: "GST 111",
            submissionId: ids.submission,
          },
        },
        include: { description: true },
      }),
    ).toMatchObject({
      description: {
        learningOutcomes: ["Write and present clearly for different audiences"],
        courseContent: "Updated centrally by the hosting department.",
        gracePass: false,
      },
    });
  });

  it("hides another department's discoverable courses from an HOD", async () => {
    authState.userId = ids.admin;
    await prisma.masterCourse.create({
      data: {
        code: "OUT 201",
        title: "Outside Department Course",
        units: 2,
        type: "CORE",
        ownership: "DEPARTMENT",
        ownerDeptId: ids.departmentB,
        level: 200,
        semester: 1,
        discoverable: true,
      },
    });

    authState.userId = ids.hod;
    const response = await listMasterCourses(
      new Request("http://localhost/api/master-courses?discoverable=true"),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).map((course: { code: string }) => course.code)).not.toContain(
      "OUT 201",
    );
  });

  it("bulk imports staff only into the HOD's department", async () => {
    authState.userId = ids.hod;
    const row = {
      type: "ACADEMIC",
      title: "DR",
      gender: "FEMALE",
      surname: "Bulk",
      firstName: "Staff",
      middleName: "",
      highestQualification: "PHD",
      academicRank: "LECTURER_I",
      customJobTitle: "",
      specialization: "Testing",
      email: "bulk.staff@example.edu",
    };
    const allowed = await bulkImportStaff(
      new Request("http://localhost/api/staff/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: ids.departmentA, rows: [row] }),
      }),
    );
    expect(allowed.status).toBe(201);
    expect(
      await prisma.staff.count({
        where: { departmentId: ids.departmentA, email: row.email },
      }),
    ).toBe(1);

    const denied = await bulkImportStaff(
      new Request("http://localhost/api/staff/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: ids.departmentB,
          rows: [{ ...row, email: "outside.staff@example.edu" }],
        }),
      }),
    );
    expect(denied.status).toBe(403);
  });

  it("validates staff email and non-academic job titles on create and update", async () => {
    authState.userId = ids.hod;
    const base = {
      type: "NON_ACADEMIC",
      title: "MS",
      gender: "FEMALE",
      surname: "Directory",
      firstName: "Tester",
      middleName: "",
      highestQualification: "MASTERS",
      academicRank: "OTHER",
      specialization: "Administration",
      departmentId: ids.departmentA,
    };

    const missingJobTitle = await createStaff(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, email: "directory@example.edu" }),
      }),
    );
    expect(missingJobTitle.status).toBe(400);

    const invalidEmail = await createStaff(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base,
          customJobTitle: "Programme Officer",
          email: "not-an-email",
        }),
      }),
    );
    expect(invalidEmail.status).toBe(400);

    const created = await createStaff(
      new Request("http://localhost/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...base,
          customJobTitle: "Programme Officer",
          email: "directory.tester@example.edu",
        }),
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string };

    const invalidUpdate = await updateStaff(
      new Request(`http://localhost/api/staff/${createdBody.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "still-not-an-email" }),
      }),
      { params: Promise.resolve({ id: createdBody.id }) },
    );
    expect(invalidUpdate.status).toBe(400);
  });

  it("bulk imports courses with their complete learning details", async () => {
    authState.userId = ids.hod;
    const response = await bulkImportCourses(
      new Request("http://localhost/api/courses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: ids.submission,
          rows: [
            {
              code: "BLK 201",
              title: "Bulk Import Course",
              units: 3,
              status: "CORE",
              semester: 1,
              level: 200,
              prerequisites: "",
              learningOutcomes: ["Validate imported course data"],
              courseContent: "Detailed imported content",
              labWork: "Import exercises",
              entrepreneurialAspect: "Prepare a reusable template",
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(201);
    const importedCourse = await prisma.course.findUniqueOrThrow({
      where: {
        code_submissionId: { code: "BLK 201", submissionId: ids.submission },
      },
      include: { description: true },
    });
    expect(importedCourse).toMatchObject({
      description: {
        learningOutcomes: ["Validate imported course data"],
        courseContent: "Detailed imported content",
        labWork: "Import exercises",
        entrepreneurialAspect: "Prepare a reusable template",
        graceStatus: "PENDING",
        gracePass: false,
      },
    });
    expect(
      await prisma.graceAssessment.count({
        where: { courseDescriptions: { some: { courseId: importedCourse.id } } },
      }),
    ).toBeGreaterThan(0);
  });

  it("allows only administrators to bulk upload Registry courses", async () => {
    const payload = {
      rows: [
        {
          code: "GST 202",
          title: "University Enterprise Studies",
          units: 2,
          type: "GST_BU",
          ownership: "INSTITUTIONAL",
          level: 200,
          semester: 2,
          description: "University-wide GST course",
          ownerDepartmentCode: "",
          ownerSchoolCode: "",
          discoverable: true,
        },
      ],
    };

    authState.userId = ids.hod;
    expect(
      (
        await bulkImportMasterCourses(
          new Request("http://localhost/api/master-courses/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        )
      ).status,
    ).toBe(403);

    authState.userId = ids.admin;
    const response = await bulkImportMasterCourses(
      new Request("http://localhost/api/master-courses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(201);
    expect(
      await prisma.masterCourse.findUnique({ where: { code: "GST 202" } }),
    ).toMatchObject({ ownership: "INSTITUTIONAL", type: "GST_BU" });
  });

  it("matches an official source programme name and preloads its Registry course", async () => {
    authState.userId = ids.admin;
    const response = await bulkImportMasterCourses(
      new Request("http://localhost/api/master-courses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            {
              code: "CCM 301",
              title: "CCMAS Programme Course",
              units: 3,
              type: "CORE",
              ownership: "INSTITUTIONAL",
              level: 300,
              semester: 1,
              learningOutcomes: ["Apply the programme curriculum"],
              courseContent: "Official programme course content.",
              curriculumSource: "CCMAS 2023",
              sourceReference: "Official test source",
              sourceProgrammes: ["Test Programme A"],
              discoverable: true,
            },
          ],
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ linked: 1 });

    const master = await prisma.masterCourse.findUniqueOrThrow({
      where: { code: "CCM 301" },
    });
    expect(
      await prisma.programmeCourse.findUnique({
        where: {
          programmeId_courseId: {
            programmeId: ids.programmeA,
            courseId: master.id,
          },
        },
      }),
    ).not.toBeNull();
    expect(
      await prisma.course.findUnique({
        where: {
          code_submissionId: {
            code: "CCM 301",
            submissionId: ids.submission,
          },
        },
        include: { description: true },
      }),
    ).toMatchObject({
      description: {
        learningOutcomes: ["Apply the programme curriculum"],
        courseContent: "Official programme course content.",
      },
    });
  });

  it("never marks a failed GRACE service call as compliant", async () => {
    authState.userId = ids.hod;
    const course = await prisma.course.create({
      data: {
        code: "TST 102",
        title: "Unsaved Description Course",
        units: 2,
        semester: 1,
        level: 100,
        submissionId: ids.submission,
      },
    });
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "";
    const content = Array.from({ length: 150 }, () => "word").join(" ");
    const contentHash = courseGraceContentHash({
      title: course.title,
      learningOutcomes: [],
      courseContent: content,
    })!;
    await prisma.graceAssessment.create({
      data: {
        contentHash,
        title: course.title,
        learningOutcomes: [],
        courseContent: content,
      },
    });
    await prisma.courseDescription.create({
      data: {
        courseId: course.id,
        submissionId: ids.submission,
        learningOutcomes: [],
        courseContent: content,
        graceContentHash: contentHash,
      },
    });

    let response!: Response;
    try {
      response = await checkGrace(
        new NextRequest("http://localhost/api/grace-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "course",
            courseId: course.id,
          }),
        }),
      );
    } finally {
      if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousKey;
    }

    expect(response.status).toBe(503);
    expect(
      await prisma.courseDescription.findUnique({
        where: { courseId: course.id },
        select: { submissionId: true, gracePass: true, graceStatus: true },
      }),
    ).toMatchObject({
      submissionId: ids.submission,
      gracePass: false,
      graceStatus: "ERROR",
    });
  });
});

describe("daily summary emails", () => {
  it("sends one summary per person and never repeats activity", async () => {
    // Earlier tests leave transitions behind; treat them as already summarised.
    await prisma.phaseTransition.updateMany({
      where: { notifiedAt: null },
      data: { notifiedAt: new Date() },
    });

    const submitted = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.phaseTransition.createMany({
      data: [
        {
          submissionId: ids.submission,
          fromPhase: 1,
          toPhase: 2,
          action: "SUBMIT",
          performedById: ids.hod,
          transitionedAt: submitted,
        },
        {
          submissionId: ids.submission,
          fromPhase: 2,
          toPhase: 1,
          action: "RETURN",
          remarks: "Please expand the programme philosophy.",
          performedById: ids.dean,
          transitionedAt: new Date(submitted.getTime() + 60_000),
        },
        {
          submissionId: ids.submission,
          fromPhase: 2,
          toPhase: 3,
          action: "APPROVE",
          performedById: ids.dean,
          transitionedAt: new Date(submitted.getTime() + 120_000),
        },
      ],
    });

    const sent: Array<{ to: string[]; subject: string; text: string }> = [];
    const previousKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "test-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        sent.push(JSON.parse(String(init?.body)));
        return new Response("{}", { status: 200 });
      });

    try {
      const first = await sendDailyDigests();
      expect(first).toMatchObject({ transitions: 3, failed: 0 });

      // The Department hand-off goes to the active Dean for that School.
      const deanEmails = sent.filter((m) => m.subject.includes("School Board review"));
      expect(deanEmails.map((m) => m.to[0]).sort()).toEqual(
        [
          `${ids.dean}@example.edu`,
          "invited.user@example.edu",
        ].sort(),
      );

      // The Dean's approval goes to every active Academic Planning admin.
      const adminEmails = sent.filter((m) =>
        m.subject.includes("Academic Planning"),
      );
      expect(adminEmails.map((m) => m.to[0]).sort()).toEqual(
        [`${ids.admin}@example.edu`, `${ids.super}@example.edu`].sort(),
      );

      // The department's HOD and every assigned programme coordinator get the
      // decision with the remarks; the deactivated HOD gets nothing.
      const hodEmails = sent.filter((m) => m.subject.includes("your bulletin"));
      expect(hodEmails.map((m) => m.to[0]).sort()).toEqual(
        [
          `${ids.hod}@example.edu`,
          `${ids.coordinator}@example.edu`,
          "second.coordinator@example.edu",
        ].sort(),
      );
      expect(hodEmails[0].subject).toContain("changes requested");
      expect(hodEmails[0].text).toContain("Please expand the programme philosophy.");

      // A second run finds nothing new and sends nothing.
      sent.length = 0;
      const second = await sendDailyDigests();
      expect(second.transitions).toBe(0);
      expect(sent).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
      if (previousKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previousKey;
    }
  });
});

describe("CCMAS catalogue sync", () => {
  it("never overwrites university courses and changes nothing on a repeat run", async () => {
    const { version } = getCcmasCatalogueSummary();
    // Take a real CCMAS code and pretend the university already created it.
    const catalogueCode = (await import("@/data/ccmas/catalogue.json")).default
      .courses[0].code as string;
    await prisma.masterCourse.create({
      data: {
        code: catalogueCode,
        title: "Babcock's own version",
        units: 2,
        type: "CORE",
        ownership: "DEPARTMENT",
        ownerDeptId: ids.departmentA,
        level: 100,
        semester: 1,
      },
    });

    try {
      const started = Date.now();
      const first = await syncCcmasCatalogue(ids.super);
      const firstMs = Date.now() - started;

      expect(first.skippedUniversityCodes).toContain(catalogueCode);
      expect(first.created).toBe(first.catalogueCourses - first.skippedUniversityCodes.length);
      const kept = await prisma.masterCourse.findUnique({
        where: { code: catalogueCode },
        select: { title: true, ownership: true, curriculumSource: true },
      });
      expect(kept).toEqual({
        title: "Babcock's own version",
        ownership: "DEPARTMENT",
        curriculumSource: null,
      });

      // The batched sync should comfortably fit a serverless time limit.
      expect(firstMs).toBeLessThan(120_000);

      // Nothing changed, so a second run writes nothing.
      const second = await syncCcmasCatalogue(ids.super);
      expect(second).toMatchObject({ created: 0, updated: 0, linksCreated: 0, linksUpdated: 0 });

      // In-progress submissions are not modified by the sync.
      expect(
        await prisma.course.count({ where: { submissionId: ids.submission, code: catalogueCode } }),
      ).toBe(0);

      const logged = await prisma.activityLog.count({
        where: { action: "CCMAS_CATALOGUE_SYNCHRONISED" },
      });
      expect(logged).toBe(2);
    } finally {
      await prisma.programmeCourse.deleteMany({
        where: { course: { curriculumSource: version } },
      });
      await prisma.masterCourse.deleteMany({ where: { curriculumSource: version } });
      await prisma.masterCourse.deleteMany({ where: { code: catalogueCode } });
    }
  }, 180_000);
});

describe("activity log", () => {
  it("records one entry per autosave session but keeps different records apart", async () => {
    const base = {
      actorId: ids.hod,
      action: "COURSE_UPDATED",
      entityType: "SUBMISSION",
      entityId: ids.submission,
      coalesceWithinMinutes: 30,
    };
    await recordActivity({ ...base, description: "Updated TST 901 - Coalesce Test." });
    await recordActivity({ ...base, description: "Updated TST 901 - Coalesce Test." });
    await recordActivity({ ...base, description: "Updated TST 901 - Coalesce Test." });
    await recordActivity({ ...base, description: "Updated TST 902 - Another Course." });

    const entries = await prisma.activityLog.findMany({
      where: { actorId: ids.hod, description: { startsWith: "Updated TST 90" } },
      select: { description: true },
    });
    expect(entries.map((e) => e.description).sort()).toEqual([
      "Updated TST 901 - Coalesce Test.",
      "Updated TST 902 - Another Course.",
    ]);

    // Without a window every call is recorded.
    await recordActivity({ ...base, coalesceWithinMinutes: undefined, description: "Updated TST 901 - Coalesce Test." });
    expect(
      await prisma.activityLog.count({
        where: { actorId: ids.hod, description: "Updated TST 901 - Coalesce Test." },
      }),
    ).toBe(2);
  });
});

// The server refuses what the page hides: the wrong school, the wrong role,
// and the wrong phase each get a 403, and a refusal changes nothing.
describe("server-side refusals", () => {
  const request = (path: string, method = "GET", body?: object) =>
    new NextRequest(`http://localhost${path}`, {
      method,
      ...(body && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
  const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });
  const transition = (id: string, action: string, remarks?: string) =>
    transitionSubmission(
      request(`/api/submissions/${id}/transition`, "POST", { action, remarks }),
      routeParams(id),
    );
  // Each test gets its own cycle: a programme has one submission per cycle.
  const createSubmission = async (key: string, programmeId: string, title: string) => {
    const cycle = await prisma.reviewCycle.create({
      data: { id: `refusal-${key}`, name: `Refusal ${key}`, createdById: ids.super },
    });
    return prisma.submission.create({
      data: { title, programmeId, createdById: ids.super, cycleId: cycle.id },
    });
  };
  const removeSubmission = async (submission: { id: string; cycleId: string | null }) => {
    await prisma.submission.delete({ where: { id: submission.id } });
    if (submission.cycleId) {
      await prisma.reviewCycle.delete({ where: { id: submission.cycleId } });
    }
  };

  it("refuses another school's submission on read and returns no record", async () => {
    const outside = await createSubmission("read", ids.programmeB, "Other School Bulletin");

    try {
      for (const userId of [ids.hod, ids.coordinator, ids.dean]) {
        authState.userId = userId;
        const record = await getSubmission(
          request(`/api/submissions/${outside.id}`),
          routeParams(outside.id),
        );
        expect(record.status).toBe(403);
        expect(await record.json()).toEqual({ error: "Forbidden" });

        const comments = await listComments(
          request(`/api/submissions/${outside.id}/comments`),
          routeParams(outside.id),
        );
        expect(comments.status).toBe(403);

        const courses = await listCourses(
          new Request(`http://localhost/api/courses?submissionId=${outside.id}`),
        );
        expect(courses.status).toBe(403);
      }

      authState.userId = ids.admin;
      const allowed = await getSubmission(
        request(`/api/submissions/${outside.id}`),
        routeParams(outside.id),
      );
      expect(allowed.status).toBe(200);
      expect(await allowed.json()).toMatchObject({ id: outside.id });
    } finally {
      await removeSubmission(outside);
    }
  });

  it("refuses edits, comments and submits on another school's submission", async () => {
    const outside = await createSubmission("write", ids.programmeB, "Other School Bulletin");

    try {
      for (const userId of [ids.hod, ids.coordinator, ids.dean]) {
        authState.userId = userId;
        const edit = await updateSubmission(
          request(`/api/submissions/${outside.id}`, "PUT", { title: "Changed" }),
          routeParams(outside.id),
        );
        expect(edit.status).toBe(403);

        const comment = await createComment(
          request(`/api/submissions/${outside.id}/comments`, "POST", {
            content: "Out-of-scope comment",
            type: "ISSUE",
          }),
          routeParams(outside.id),
        );
        expect(comment.status).toBe(403);

        expect((await transition(outside.id, "SUBMIT")).status).toBe(403);
      }

      expect(
        await prisma.submission.findUniqueOrThrow({
          where: { id: outside.id },
          select: { title: true, currentPhase: true, status: true },
        }),
      ).toEqual({ title: "Other School Bulletin", currentPhase: 1, status: "DRAFT" });
      expect(await prisma.comment.count({ where: { submissionId: outside.id } })).toBe(0);
      expect(
        await prisma.phaseTransition.count({ where: { submissionId: outside.id } }),
      ).toBe(0);
    } finally {
      await removeSubmission(outside);
    }
  });

  it("refuses workflow actions for the wrong role or the wrong phase", async () => {
    const submission = await createSubmission("phase", ids.programmeA, "Phase Gate Bulletin");
    // An unchecked course: a caller with the wrong role must be refused
    // before the GRACE gate is consulted, not told what the course lacks.
    await prisma.course.create({
      data: {
        code: "PGT 101",
        title: "Phase Gate Course",
        units: 2,
        semester: 1,
        level: 100,
        submissionId: submission.id,
      },
    });
    const setStage = (currentPhase: number, status: "DRAFT" | "IN_REVIEW") =>
      prisma.submission.update({
        where: { id: submission.id },
        data: { currentPhase, status },
      });
    const refusals: Array<[userId: string, action: string]> = [];

    try {
      // Phase 1 draft: only the department may submit, and nothing is approved.
      await setStage(1, "DRAFT");
      refusals.push(
        [ids.dean, "SUBMIT"],
        [ids.admin, "SUBMIT"],
        [ids.admin, "APPROVE"],
        [ids.hod, "APPROVE"],
      );
      for (const [userId, action] of refusals.splice(0)) {
        authState.userId = userId;
        const response = await transition(submission.id, action);
        expect({ userId, action, status: response.status }).toEqual({
          userId,
          action,
          status: 403,
        });
        expect(await response.json()).not.toHaveProperty("blockers");
      }

      // Phase 2: only the Dean reviews; the department can no longer edit.
      await setStage(2, "IN_REVIEW");
      refusals.push(
        [ids.hod, "APPROVE"],
        [ids.coordinator, "APPROVE"],
        [ids.admin, "APPROVE"],
        [ids.hod, "SUBMIT"],
      );
      for (const [userId, action] of refusals.splice(0)) {
        authState.userId = userId;
        const response = await transition(submission.id, action, "Remarks");
        expect({ userId, action, status: response.status }).toEqual({
          userId,
          action,
          status: 403,
        });
      }
      authState.userId = ids.hod;
      const lateEdit = await updateSubmission(
        request(`/api/submissions/${submission.id}`, "PUT", { title: "Late edit" }),
        routeParams(submission.id),
      );
      expect(lateEdit.status).toBe(403);

      // Phase 3: Academic Planning owns the record; the Dean and department don't.
      await setStage(3, "IN_REVIEW");
      refusals.push(
        [ids.dean, "APPROVE"],
        [ids.hod, "RETURN"],
        [ids.coordinator, "REJECT"],
      );
      for (const [userId, action] of refusals.splice(0)) {
        authState.userId = userId;
        const response = await transition(submission.id, action, "Remarks");
        expect({ userId, action, status: response.status }).toEqual({
          userId,
          action,
          status: 403,
        });
      }
      authState.userId = ids.dean;
      const deanEdit = await updateSubmission(
        request(`/api/submissions/${submission.id}`, "PUT", { title: "Dean edit" }),
        routeParams(submission.id),
      );
      expect(deanEdit.status).toBe(403);

      // None of the refusals moved the record or wrote a transition.
      expect(
        await prisma.submission.findUniqueOrThrow({
          where: { id: submission.id },
          select: { title: true, currentPhase: true, status: true },
        }),
      ).toEqual({ title: "Phase Gate Bulletin", currentPhase: 3, status: "IN_REVIEW" });
      expect(
        await prisma.phaseTransition.count({ where: { submissionId: submission.id } }),
      ).toBe(0);

      // The right caller at the right phase still goes through.
      authState.userId = ids.admin;
      expect((await transition(submission.id, "APPROVE")).status).toBe(200);
      expect(
        await prisma.submission.findUniqueOrThrow({
          where: { id: submission.id },
          select: { currentPhase: true },
        }),
      ).toEqual({ currentPhase: 4 });
    } finally {
      await removeSubmission(submission);
    }
  });

  it("refuses role and account changes by anyone below their tier, and logs each one", async () => {
    const patch = (id: string, body: object) =>
      updateUser(request(`/api/users/${id}`, "PATCH", body), routeParams(id));
    const attempts: Array<[actor: string, target: string, body: object]> = [
      [ids.hod, ids.hod, { role: "SUPER_ADMIN" }],
      [ids.hod, ids.dean, { role: "HOD" }],
      [ids.coordinator, ids.coordinator, { role: "ADMIN" }],
      [ids.dean, ids.hod, { role: "DEAN" }],
      [ids.admin, ids.hod, { role: "SUPER_ADMIN" }],
      [ids.admin, ids.super, { role: "HOD" }],
      [ids.admin, ids.hod, { isActive: false }],
    ];
    const rolesBefore = await prisma.user.findMany({
      select: { id: true, role: true, isActive: true },
      orderBy: { id: "asc" },
    });
    const refusedBefore = await prisma.activityLog.count({
      where: { action: "USER_UPDATE_REFUSED" },
    });

    for (const [actor, target, body] of attempts) {
      authState.userId = actor;
      const response = await patch(target, body);
      expect({ actor, target, status: response.status }).toEqual({
        actor,
        target,
        status: 403,
      });
      const entry = await prisma.activityLog.findFirst({
        where: { action: "USER_UPDATE_REFUSED", actorId: actor, entityId: target },
        orderBy: { createdAt: "desc" },
      });
      expect(entry?.metadata).toMatchObject({ attempted: body });
    }

    expect(
      await prisma.user.findMany({
        select: { id: true, role: true, isActive: true },
        orderBy: { id: "asc" },
      }),
    ).toEqual(rolesBefore);
    expect(
      await prisma.activityLog.count({ where: { action: "USER_UPDATE_REFUSED" } }),
    ).toBe(refusedBefore + attempts.length);
  });
});

// The checks the page runs before Submit are enforced by the server too, so a
// draft with contradictions can't be sent by calling the API directly.
describe("submit validators", () => {
  const cycleId = "submit-validators-cycle";
  const submissionId = "submit-validators-submission";

  beforeAll(async () => {
    await prisma.reviewCycle.create({
      data: { id: cycleId, name: "Submit Validators", createdById: ids.super },
    });
  });

  beforeEach(async () => {
    await prisma.submission.deleteMany({ where: { id: submissionId } });
    await prisma.submission.create({
      data: {
        id: submissionId,
        title: "Submit Validators Bulletin",
        programmeId: ids.programmeA,
        createdById: ids.hod,
        cycleId,
      },
    });
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { id: submissionId } });
    await prisma.reviewCycle.deleteMany({ where: { id: cycleId } });
  });

  const submit = () => {
    authState.userId = ids.hod;
    return transitionSubmission(
      new NextRequest(`http://localhost/api/submissions/${submissionId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SUBMIT" }),
      }),
      { params: Promise.resolve({ id: submissionId }) },
    );
  };
  const save = (content: object) => {
    authState.userId = ids.hod;
    return updateSubmission(
      new NextRequest(`http://localhost/api/submissions/${submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
      { params: Promise.resolve({ id: submissionId }) },
    );
  };
  const refusalCodes = async () => {
    const response = await submit();
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe("SUBMISSION_INCOMPLETE");
    // Every reason is also listed for the page to show.
    expect(body.issues).toEqual(
      expect.arrayContaining(body.readiness.map((item: { message: string }) => item.message)),
    );
    return body.readiness.map((item: { code: string }) => item.code) as string[];
  };
  const stage = () =>
    prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      select: { currentPhase: true, status: true },
    });

  it("refuses an empty draft with every reason at once", async () => {
    expect(await refusalCodes()).toEqual(
      expect.arrayContaining([
        "NO_COURSES",
        "MISSING_PHILOSOPHY",
        "MISSING_MISSION",
        "MISSING_MINIMUM_DURATION",
        "MISSING_MINIMUM_CGPA",
        "MISSING_TOTAL_UNITS",
      ]),
    );
    expect(await stage()).toEqual({ currentPhase: 1, status: "DRAFT" });
  });

  it("refuses each contradiction with a specific reason, then submits once it is fixed", async () => {
    await prepareDraftForSubmit(submissionId);
    const fix = (data: object) =>
      prisma.submissionContent.update({ where: { submissionId }, data });

    // The audit's case: 203 units declared against the structured courses.
    await fix({ totalUnits: 203 });
    const mismatch = await submit();
    expect(mismatch.status).toBe(409);
    expect((await mismatch.json()).readiness).toEqual([
      {
        code: "UNIT_TOTAL_MISMATCH",
        message: "The course structure contains 3 units, but the programme states 203 expected units.",
      },
    ]);
    await fix({ totalUnits: 3 });

    await fix({ minimumCGPA: 7 });
    expect(await refusalCodes()).toEqual(["CGPA_OUT_OF_RANGE"]);
    await fix({ minimumCGPA: 2.5 });

    await fix({ philosophy: "Too short to be a philosophy." });
    expect(await refusalCodes()).toEqual(
      expect.arrayContaining(["PHILOSOPHY_LENGTH", "PHILOSOPHY_GRACE_REQUIRED"]),
    );

    // Editing the philosophy after it passed, while claiming a pass in the
    // save, leaves the old result stale: GRACE must be run again.
    expect(
      (await save({ philosophy: `${readyPhilosophy} amended`, philosophyGracePass: true })).status,
    ).toBe(200);
    expect(await refusalCodes()).toEqual(["PHILOSOPHY_GRACE_REQUIRED"]);

    expect(await stage()).toEqual({ currentPhase: 1, status: "DRAFT" });
    expect(await prisma.phaseTransition.count({ where: { submissionId } })).toBe(0);

    // Back to the wording that passed: the draft is clean and submits.
    expect((await save({ philosophy: readyPhilosophy })).status).toBe(200);
    expect((await submit()).status).toBe(200);
    expect(await stage()).toEqual({ currentPhase: 2, status: "IN_REVIEW" });
  });

  it("never lets a save mark the philosophy as passing GRACE", async () => {
    expect(
      (
        await save({
          philosophy: readyPhilosophy,
          philosophyGracePass: true,
          philosophyGrace: { passed: true, contentHash: philosophyGraceHash(readyPhilosophy) },
        })
      ).status,
    ).toBe(200);
    expect(
      await prisma.submissionContent.findUniqueOrThrow({
        where: { submissionId },
        select: { philosophyGracePass: true, philosophyGrace: true },
      }),
    ).toEqual({ philosophyGracePass: false, philosophyGrace: null });
  });
});

// Who may act at each phase is data, no one clears two gates in a row, and
// Senate closes only with its minute reference.
describe("phase owners and separation of duties", () => {
  const cycleId = "phase-owners-cycle";
  const submissionId = "phase-owners-submission";
  const secondAdmin = "test-admin-2";

  beforeAll(async () => {
    await prisma.reviewCycle.create({
      data: { id: cycleId, name: "Phase Owners", createdById: ids.super },
    });
    await prisma.user.create({
      data: {
        id: secondAdmin,
        email: `${secondAdmin}@example.edu`,
        firstName: "Second",
        lastName: "Admin",
        role: "ADMIN",
      },
    });
  });

  beforeEach(async () => {
    await prisma.phaseOwner.deleteMany({});
    await prisma.submission.deleteMany({ where: { id: submissionId } });
  });

  afterAll(async () => {
    await prisma.phaseOwner.deleteMany({});
    await prisma.submission.deleteMany({ where: { id: submissionId } });
    await prisma.reviewCycle.deleteMany({ where: { id: cycleId } });
    await prisma.user.deleteMany({ where: { id: secondAdmin } });
  });

  const act = async (userId: string, action: string, extra: object = {}) => {
    authState.userId = userId;
    const response = await transitionSubmission(
      new NextRequest(`http://localhost/api/submissions/${submissionId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      }),
      { params: Promise.resolve({ id: submissionId }) },
    );
    return { status: response.status, body: await response.json() };
  };
  const workflowFor = async (userId: string) => {
    authState.userId = userId;
    const response = await getSubmission(
      new NextRequest(`http://localhost/api/submissions/${submissionId}`),
      { params: Promise.resolve({ id: submissionId }) },
    );
    return { status: response.status, workflow: (await response.json()).workflow };
  };
  const phase = async () =>
    (
      await prisma.submission.findUniqueOrThrow({
        where: { id: submissionId },
        select: { currentPhase: true },
      })
    ).currentPhase;
  const createDraft = async (programmeId: string) => {
    await prisma.submission.create({
      data: {
        id: submissionId,
        title: "Phase Owners Bulletin",
        programmeId,
        createdById: ids.hod,
        cycleId,
      },
    });
  };

  it("lets no single person clear two gates in a row", async () => {
    await createDraft(ids.programmeA);
    await prepareDraftForSubmit(submissionId);

    expect((await act(ids.hod, "SUBMIT")).status).toBe(200);
    expect((await act(ids.dean, "APPROVE")).status).toBe(200);
    expect((await act(ids.admin, "APPROVE")).status).toBe(200);
    expect(await phase()).toBe(4);

    // The admin who cleared Phase 3 can't also clear Phase 4, and the page
    // is told why instead of being offered the button.
    expect(await act(ids.admin, "APPROVE")).toMatchObject({
      status: 403,
      body: { code: "SEPARATION_OF_DUTIES" },
    });
    expect((await workflowFor(ids.admin)).workflow).toMatchObject({
      actions: ["RETURN", "REJECT"],
      clearedPreviousGate: true,
    });
    expect((await workflowFor(secondAdmin)).workflow).toMatchObject({
      actions: ["APPROVE", "RETURN", "REJECT"],
      clearedPreviousGate: false,
    });

    // The Super Admin override is bound by the same rule.
    expect((await act(secondAdmin, "APPROVE")).status).toBe(200);
    expect((await act(ids.super, "APPROVE")).status).toBe(200);
    expect(await phase()).toBe(6);
    expect((await act(ids.super, "APPROVE", { reference: "SEN/2027/14" })).status).toBe(403);

    // Senate closes only with its minute reference, which is kept on the record.
    expect((await workflowFor(ids.admin)).workflow.requiredEvidence).toBe(
      "Senate minute reference",
    );
    expect(await act(ids.admin, "APPROVE")).toMatchObject({
      status: 400,
      body: { code: "EVIDENCE_REQUIRED" },
    });
    expect((await act(ids.admin, "APPROVE", { reference: "   " })).status).toBe(400);
    expect(await phase()).toBe(6);
    expect((await act(ids.admin, "APPROVE", { reference: " SEN/2027/14 " })).status).toBe(200);
    expect(
      await prisma.phaseTransition.findFirst({
        where: { submissionId, fromPhase: 6, action: "APPROVE" },
        select: { reference: true, performedById: true },
      }),
    ).toEqual({ reference: "SEN/2027/14", performedById: ids.admin });
    expect(await phase()).toBe(7);

    // Refusals wrote nothing: one transition per gate that was actually cleared.
    expect(await prisma.phaseTransition.count({ where: { submissionId } })).toBe(6);
  });

  it("follows the phase-owner table, including owners named by user", async () => {
    // Phase 7 (Editing) handed from Academic Planning to one named person,
    // here a Dean of another school, without any code change.
    await prisma.phaseOwner.createMany({
      data: [
        ...DEFAULT_PHASE_OWNERS.filter((owner) => owner.phase !== 7),
        { phase: 7, role: null, userId: ids.dean },
      ],
    });
    await createDraft(ids.programmeB);
    await prisma.submission.update({
      where: { id: submissionId },
      data: { currentPhase: 7, status: "IN_REVIEW" },
    });

    expect((await act(ids.admin, "APPROVE")).status).toBe(403);
    expect((await workflowFor(ids.admin)).workflow.actions).toEqual([]);

    // The named owner sees and clears a School B bulletin at their phase.
    const owner = await workflowFor(ids.dean);
    expect(owner.status).toBe(200);
    expect(owner.workflow.actions).toEqual(["APPROVE", "RETURN", "REJECT"]);
    expect((await act(ids.dean, "APPROVE")).status).toBe(200);
    expect(await phase()).toBe(8);

    // Past their phase, the bulletin is back outside their reach.
    expect((await workflowFor(ids.dean)).status).toBe(403);
    expect((await act(ids.admin, "APPROVE")).status).toBe(200);
  });
});
