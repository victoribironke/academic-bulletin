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
import { POST as createComment } from "@/app/api/submissions/[id]/comments/route";
import { POST as checkGrace } from "@/app/api/grace-check/route";
import { GET as listMasterCourses } from "@/app/api/master-courses/route";
import { PATCH as updateMasterCourse } from "@/app/api/master-courses/[id]/route";
import { canExportBulletin } from "@/lib/bulletin/access";
import { GET as getCurrentUser } from "@/app/api/users/me/route";
import { POST as bulkImportStaff } from "@/app/api/staff/bulk/route";
import { POST as createStaff } from "@/app/api/staff/route";
import { PATCH as updateStaff } from "@/app/api/staff/[id]/route";
import { POST as bulkImportCourses } from "@/app/api/courses/bulk/route";
import { POST as bulkImportMasterCourses } from "@/app/api/master-courses/bulk/route";
import { GET as listSubmissions } from "@/app/api/submissions/route";

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
  inactive: "test-inactive",
};

async function clearFixtures() {
  await prisma.courseDescription.deleteMany({});
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
    await prisma.courseDescription.create({
      data: {
        submissionId: ids.submission,
        courseId: course.id,
        learningOutcomes: ["Test an outcome"],
        courseContent: "Detailed course content",
        labWork: "Practical work",
        entrepreneurialAspect: "Commercial application",
        gracePass: true,
        graceResult: { passed: true, scores: { G: 4 } },
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
    expect(
      await prisma.course.findUnique({
        where: {
          code_submissionId: { code: "BLK 201", submissionId: ids.submission },
        },
        include: { description: true },
      }),
    ).toMatchObject({
      description: {
        learningOutcomes: ["Validate imported course data"],
        courseContent: "Detailed imported content",
        labWork: "Import exercises",
        entrepreneurialAspect: "Prepare a reusable template",
      },
    });
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

  it("does not persist a failed GRACE service call as a compliance result", async () => {
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

    let response!: Response;
    try {
      response = await checkGrace(
        new NextRequest("http://localhost/api/grace-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "course",
            courseId: course.id,
            title: course.title,
            content: Array.from({ length: 150 }, () => "word").join(" "),
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
        select: { submissionId: true, gracePass: true },
      }),
    ).toBeNull();
  });
});
