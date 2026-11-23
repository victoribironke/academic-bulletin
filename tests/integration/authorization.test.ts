import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { after, NextRequest } from "next/server";

const authState = vi.hoisted(() => ({
  userId: null as string | null,
  // This sign-in's id. Unset, each user gets "session-<id>", which the
  // beforeEach below marks as having passed two-step verification for admins.
  sessionId: undefined as string | null | undefined,
  mfa: "verified" as "none" | "pending" | "verified",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// after() needs a real request scope; workflow emails aren't under test here.
// D4: a Super Administrator acting outside their own phase gives a reason.
// Helpers send this one; the "phase overrides (D4)" tests check the refusals.
const SUPER_ADMIN_OVERRIDE = { reason: "Test: Super Administrator acting outside their own phase." };
const overrideFor = (userId: string) => (userId === "test-super" ? { override: SUPER_ADMIN_OVERRIDE } : {});

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));

// The signed-in user comes from Auth.js; tests set it through authState.
vi.mock("@/auth", () => {
  const access = () =>
    authState.userId
      ? {
          userId: authState.userId,
          sessionId:
            authState.sessionId === undefined ? `session-${authState.userId}` : authState.sessionId,
          mfa: authState.mfa,
        }
      : null;
  return {
    auth: async () => (authState.userId ? { user: { id: authState.userId } } : null),
    getSessionAccess: async () => access(),
    getSessionUserId: async () => {
      const current = access();
      return current && current.mfa !== "pending" ? current.userId : null;
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    handlers: {},
  };
});

import prisma from "@/lib/prisma";
import {
  canAccessDepartment,
  canReadSubmission,
  canViewSubmission,
  canWriteSubmission,
  getApiUser,
  requireApiUser,
} from "@/lib/api-auth";
import { POST as createSchool } from "@/app/api/schools/route";
import { DELETE as deleteSchool } from "@/app/api/schools/[id]/route";
import { DELETE as deleteDepartment } from "@/app/api/departments/[id]/route";
import { DELETE as deleteProgramme } from "@/app/api/programmes/[id]/route";
import { DELETE as deleteUser, PATCH as updateUser } from "@/app/api/users/[id]/route";
import { adminCreateUser } from "@/app/actions/admin";
import { GET as listCourses, POST as createCourseRow } from "@/app/api/courses/route";
import { POST as transitionSubmission } from "@/app/api/submissions/[id]/transition/route";
import { getSubmissionWorkflow } from "@/lib/submissions/phase-owners";
import { PHILOSOPHY_GRACE_MESSAGE } from "@/lib/submissions/grace-gate";
import {
  DELETE as deleteSubmission,
  GET as getSubmission,
  PUT as updateSubmission,
} from "@/app/api/submissions/[id]/route";
import { GET as listComments, POST as createComment } from "@/app/api/submissions/[id]/comments/route";
import { POST as checkGrace } from "@/app/api/grace-check/route";
import { POST as processGraceQueue } from "@/app/api/grace-check/process/route";
import { GET as readGraceProgress } from "@/app/api/grace-check/progress/route";
import { AI_RATE_LIMITS, pruneRateLimits, takeRateLimit } from "@/lib/rate-limit";
import { GRACE_RUBRIC_VERSION } from "@/lib/grace";
import { GET as listMasterCourses } from "@/app/api/master-courses/route";
import {
  DELETE as deleteMasterCourse,
  PATCH as updateMasterCourse,
} from "@/app/api/master-courses/[id]/route";
import { canExportBulletin } from "@/lib/bulletin/access";
import { sendDailyDigests } from "@/lib/email/notifications";
import { getCcmasCatalogueSummary, syncCcmasCatalogue } from "@/lib/courses/ccmas-catalogue";
import { recordActivity } from "@/lib/activity-log";
import { GET as getCurrentUser } from "@/app/api/users/me/route";
import { POST as bulkImportStaff } from "@/app/api/staff/bulk/route";
import { POST as createStaff } from "@/app/api/staff/route";
import { DELETE as deleteStaff, PATCH as updateStaff } from "@/app/api/staff/[id]/route";
import { DELETE as deleteCourseRow, PATCH as updateCourseRow } from "@/app/api/courses/[id]/route";
import { DELETE as deleteComment } from "@/app/api/submissions/[id]/comments/[commentId]/route";
import { DELETE as deleteCycle } from "@/app/api/cycles/[id]/route";
import { GET as listArchive } from "@/app/api/archive/route";
import { POST as restoreArchived } from "@/app/api/archive/[id]/restore/route";
import { confirmationMatches } from "@/lib/archive";
import { GET as readStoredFile } from "@/app/api/files/[...key]/route";
import { POST as uploadStaffPhoto } from "@/app/api/staff/[id]/image/route";
import { POST as uploadSubmissionPhoto } from "@/app/api/submissions/[id]/image/route";
import {
  DELETE as deleteSignInException,
  PUT as putSignInException,
} from "@/app/api/users/[id]/sign-in-exception/route";
import sharp from "sharp";
import { POST as startTwoStepSetup } from "@/app/api/mfa/setup/route";
import { POST as confirmTwoStepSetup } from "@/app/api/mfa/setup/confirm/route";
import { POST as verifyTwoStepCode } from "@/app/api/mfa/verify/route";
import { POST as renewRecoveryCodes } from "@/app/api/mfa/recovery-codes/route";
import { GET as readTwoStepStatus } from "@/app/api/mfa/status/route";
import { DELETE as resetTwoStep } from "@/app/api/users/[id]/mfa/route";
import { GET as listFullUsers } from "@/app/api/users/full/route";
import { base32Decode, totpCode, totpStep } from "@/lib/mfa/totp";
import { MFA_SESSION_MS } from "@/lib/mfa/policy";
import { POST as bulkImportCourses } from "@/app/api/courses/bulk/route";
import { POST as bulkImportMasterCourses } from "@/app/api/master-courses/bulk/route";
import { GET as listSubmissions } from "@/app/api/submissions/route";
import { GET as listActivities } from "@/app/api/activity-log/route";
import { GET as getDashboardStats } from "@/app/api/dashboard/stats/route";
import { courseGraceContentHash } from "@/lib/courses/grace-compliance";
import { preloadRegistryCoursesForSubmission } from "@/lib/courses/gst-pool";
import { GET as getDeadlines } from "@/app/api/calendar/desk/route";
import { type CalendarSettings, applyCalendarSettings } from "@/lib/calendar/settings";
import { type RosterRow, applyRoster, planRoster } from "@/lib/people/roster";
import { sendDueInvitations, sendInvitation } from "@/lib/people/invitations";
import { loadCodeLookups } from "@/lib/units/code-aliases";
import { RECHECK_MS, allowGoogleSignIn, refreshSessionToken } from "@/lib/auth-callbacks";
import { philosophyGraceHash } from "@/lib/submissions/submit-readiness";
import { DEFAULT_PHASE_OWNERS } from "@/lib/submissions/workflow";
import { bulletinContentHash } from "@/lib/submissions/ledger";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client as PgClient } from "pg";

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
  await prisma.archivedRecord.deleteMany({});
  await prisma.apiRateLimit.deleteMany({});
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
        email: `${ids.super}@babcock.edu.ng`,
        firstName: "Super",
        lastName: "Admin",
        role: "SUPER_ADMIN",
      },
      {
        id: ids.admin,
        email: `${ids.admin}@babcock.edu.ng`,
        firstName: "Academic",
        lastName: "Admin",
        role: "ADMIN",
      },
      {
        id: ids.dean,
        email: `${ids.dean}@babcock.edu.ng`,
        firstName: "Test",
        lastName: "Dean",
        role: "DEAN",
        schoolId: ids.schoolA,
      },
      {
        id: ids.hod,
        email: `${ids.hod}@babcock.edu.ng`,
        firstName: "Test",
        lastName: "Hod",
        role: "HOD",
        schoolId: ids.schoolA,
        departmentId: ids.departmentA,
      },
      {
        id: ids.coordinator,
        email: `${ids.coordinator}@babcock.edu.ng`,
        firstName: "Programme",
        lastName: "Coordinator",
        role: "PROGRAMME_COORDINATOR",
        schoolId: ids.schoolA,
        departmentId: ids.departmentA,
      },
      {
        id: ids.inactive,
        email: `${ids.inactive}@babcock.edu.ng`,
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

beforeEach(async () => {
  authState.userId = null;
  authState.sessionId = undefined;
  authState.mfa = "verified";
  // Admins act only from a sign-in that passed two-step verification. Each
  // admin's default test session ("session-<id>") counts as having passed.
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    select: { id: true },
  });
  await prisma.mfaVerification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      sessionId: `session-${admin.id}`,
      method: "AUTHENTICATOR",
    })),
    skipDuplicates: true,
  });
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

  it("deactivates a user, making API authentication fail", async () => {
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
    const del = (id: string, confirm?: string) =>
      deleteUser(
        new NextRequest(`http://localhost/api/users/${id}`, {
          method: "DELETE",
          ...(confirm !== undefined && { body: JSON.stringify({ confirm }) }),
        }),
        { params: Promise.resolve({ id }) },
      );

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

    // Someone with no history is removed, once DELETE is typed (Q7).
    const unconfirmed = await del("test-to-delete");
    expect(unconfirmed.status).toBe(400);
    expect(await unconfirmed.json()).toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      confirmText: "DELETE",
    });
    // Their email is no longer what is asked for.
    expect((await del("test-to-delete", "test-to-delete@example.edu")).status).toBe(400);
    expect(await prisma.user.count({ where: { id: "test-to-delete" } })).toBe(1);
    expect((await del("test-to-delete", " delete ")).status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: "test-to-delete" } })).toBeNull();
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
      // Not a babcock.edu.ng address, so it needs a sign-in exception.
      needsSignInException: true,
    });
    // Only the user record is created; a Google sign-in with the same email
    // is matched to it.
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
            body: JSON.stringify({ action, remarks, ...overrideFor(userId) }),
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

  it("refuses approval past GRACE results that haven't passed, except a logged override", async () => {
    const cycleId = "grace-approval-cycle";
    const submissionId = "grace-approval-submission";
    await prisma.reviewCycle.create({
      data: { id: cycleId, name: "GRACE Approval Cycle", createdById: ids.super },
    });
    await prisma.submission.create({
      data: {
        id: submissionId,
        title: "GRACE Approval Submission",
        programmeId: ids.programmeA,
        createdById: ids.hod,
        cycleId,
      },
    });
    await prepareDraftForSubmit(submissionId);

    const transition = (userId: string, action: string, extra: object = {}) => {
      authState.userId = userId;
      return transitionSubmission(
        new NextRequest(`http://localhost/api/submissions/${submissionId}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...overrideFor(userId), ...extra }),
        }),
        { params: Promise.resolve({ id: submissionId }) },
      );
    };
    const phase = async () =>
      (
        await prisma.submission.findUniqueOrThrow({
          where: { id: submissionId },
          select: { currentPhase: true },
        })
      ).currentPhase;
    const reason = "Senate needs this bulletin before the GRACE rerun can finish.";

    try {
      expect((await transition(ids.hod, "SUBMIT")).status).toBe(200);
      expect(await phase()).toBe(2);

      // A result that fails after Submit (or a bulletin that reached review
      // before Submit checked) must not be approved on.
      await prisma.courseDescription.updateMany({
        where: { submissionId },
        data: { graceStatus: "NEEDS_REVISION", gracePass: false },
      });
      await prisma.submissionContent.update({
        where: { submissionId },
        data: { philosophyGracePass: false },
      });

      const blocked = await transition(ids.dean, "APPROVE");
      expect(blocked.status).toBe(409);
      const blockedBody = await blocked.json();
      expect(blockedBody).toMatchObject({
        code: "GRACE_APPROVAL_BLOCKED",
        blockers: { needsRevision: ["RDY 101"] },
      });
      expect(blockedBody.issues).toContain(PHILOSOPHY_GRACE_MESSAGE);
      expect(await phase()).toBe(2);

      // The page is told the same, and who may override.
      const submission = { id: submissionId, currentPhase: 2, status: "IN_REVIEW" as const };
      expect(
        (await getSubmissionWorkflow({ id: ids.dean, role: "DEAN" }, submission)).graceGate,
      ).toMatchObject({ blocked: true, canOverride: false });
      expect(
        (await getSubmissionWorkflow({ id: ids.super, role: "SUPER_ADMIN" }, submission))
          .graceGate,
      ).toMatchObject({ blocked: true, canOverride: true });

      // The Dean can't override, whatever the reason.
      const deanOverride = await transition(ids.dean, "APPROVE", { graceOverride: { reason } });
      expect(deanOverride.status).toBe(403);
      expect(await deanOverride.json()).toMatchObject({ code: "GRACE_OVERRIDE_NOT_ALLOWED" });

      // Super Admin needs to override deliberately, with a real reason.
      expect((await transition(ids.super, "APPROVE")).status).toBe(409);
      const shortReason = await transition(ids.super, "APPROVE", {
        graceOverride: { reason: "ok" },
      });
      expect(shortReason.status).toBe(400);
      expect(await shortReason.json()).toMatchObject({
        code: "GRACE_OVERRIDE_REASON_REQUIRED",
      });
      expect(await phase()).toBe(2);
      expect(
        await prisma.phaseTransition.count({ where: { submissionId, action: "APPROVE" } }),
      ).toBe(0);

      const overridden = await transition(ids.super, "APPROVE", {
        graceOverride: { reason: `  ${reason}  ` },
      });
      expect(overridden.status).toBe(200);
      expect(await phase()).toBe(3);
      const ledger = await prisma.phaseTransition.findFirstOrThrow({
        where: { submissionId, action: "APPROVE" },
      });
      expect(ledger).toMatchObject({
        fromPhase: 2,
        toPhase: 3,
        actorRole: "SUPER_ADMIN",
        performedById: ids.super,
        graceOverride: {
          reason,
          courses: { needsRevision: ["RDY 101"] },
          philosophy: true,
        },
      });
      const activity = await prisma.activityLog.findFirstOrThrow({
        where: { entityId: submissionId, action: "SUBMISSION_APPROVE" },
      });
      expect(activity.description).toContain("override");
      expect(activity.description).toContain(reason);

      // An override covers one approval only: the next phase is gated again.
      const nextPhase = await transition(ids.admin, "APPROVE");
      expect(nextPhase.status).toBe(409);
      expect(await phase()).toBe(3);

      // Once the results pass, approval needs no override and records none.
      await prisma.courseDescription.updateMany({
        where: { submissionId },
        data: { graceStatus: "COMPLIANT", gracePass: true },
      });
      await prisma.submissionContent.update({
        where: { submissionId },
        data: { philosophyGracePass: true },
      });
      const clean = await transition(ids.admin, "APPROVE");
      expect(clean.status).toBe(200);
      const cleanLedger = await prisma.phaseTransition.findFirstOrThrow({
        where: { submissionId, action: "APPROVE", fromPhase: 3 },
      });
      expect(cleanLedger.graceOverride).toBeNull();
    } finally {
      await prisma.activityLog.deleteMany({ where: { entityId: submissionId } });
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

  it("preloads the central GST pool into an HoD submission, locked (W1)", async () => {
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

    // The Registry routes preload drafts when a course is added (G6: reading
    // the list no longer does).
    await preloadRegistryCoursesForSubmission(ids.submission);
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
          isGeneralEducation: true,
          isMandatory: true,
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
    const earlier = await prisma.phaseTransition.findMany({
      where: { notification: null },
      select: { id: true },
    });
    await prisma.phaseTransitionNotification.createMany({
      data: earlier.map((t) => ({ transitionId: t.id })),
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
        {
          // Emailed by older code, which marked the row itself, after the
          // migration had carried the earlier marks across.
          id: "digest-legacy-sent",
          submissionId: ids.submission,
          fromPhase: 1,
          toPhase: 2,
          action: "SUBMIT",
          performedById: ids.hod,
          transitionedAt: new Date(submitted.getTime() - 60_000),
          notifiedAt: submitted,
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
          `${ids.dean}@babcock.edu.ng`,
          "invited.user@example.edu",
        ].sort(),
      );

      // The Dean's approval goes to every active Academic Planning admin.
      const adminEmails = sent.filter((m) =>
        m.subject.includes("Academic Planning"),
      );
      expect(adminEmails.map((m) => m.to[0]).sort()).toEqual(
        [`${ids.admin}@babcock.edu.ng`, `${ids.super}@babcock.edu.ng`].sort(),
      );

      // The department's HOD and every assigned programme coordinator get the
      // decision with the remarks; the deactivated HOD gets nothing.
      const hodEmails = sent.filter((m) => m.subject.includes("your bulletin"));
      expect(hodEmails.map((m) => m.to[0]).sort()).toEqual(
        [
          `${ids.hod}@babcock.edu.ng`,
          `${ids.coordinator}@babcock.edu.ng`,
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

      // What was sent is recorded beside the ledger; its rows are untouched,
      // and the row older code marked is neither re-sent nor re-recorded.
      expect(
        await prisma.phaseTransition.findMany({
          where: { notifiedAt: { not: null } },
          select: { id: true },
        }),
      ).toEqual([{ id: "digest-legacy-sent" }]);
      expect(
        await prisma.phaseTransitionNotification.count({
          where: { transitionId: "digest-legacy-sent" },
        }),
      ).toBe(0);
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

describe("registry preload", () => {
  it("keeps Registry courses that share a title instead of failing", async () => {
    const shared = {
      title: "Nigerian Peoples and Culture",
      units: 2,
      type: "GST_NUC" as const,
      ownership: "INSTITUTIONAL" as const,
      level: 100,
      semester: 1,
      discoverable: true,
    };
    await prisma.masterCourse.createMany({
      data: [
        { ...shared, code: "DUP 112" },
        { ...shared, code: "DUP 113" },
      ],
    });
    // Earlier tests may have moved the shared fixture along the workflow.
    await prisma.submission.update({
      where: { id: ids.submission },
      data: { status: "DRAFT", currentPhase: 1 },
    });
    try {
      await expect(
        preloadRegistryCoursesForSubmission(ids.submission),
      ).resolves.toMatchObject({ added: expect.any(Number) });
      const courses = await prisma.course.findMany({
        where: { submissionId: ids.submission, code: { in: ["DUP 112", "DUP 113"] } },
        select: { code: true, title: true },
        orderBy: { code: "asc" },
      });
      expect(courses).toEqual([
        { code: "DUP 112", title: "Nigerian Peoples and Culture" },
        { code: "DUP 113", title: "Nigerian Peoples and Culture (DUP 113)" },
      ]);

      // Running it again links the existing rows without errors.
      await expect(
        preloadRegistryCoursesForSubmission(ids.submission),
      ).resolves.toMatchObject({ added: 0 });
    } finally {
      await prisma.course.deleteMany({
        where: { submissionId: ids.submission, code: { in: ["DUP 112", "DUP 113"] } },
      });
      await prisma.programmeCourse.deleteMany({
        where: { course: { code: { in: ["DUP 112", "DUP 113"] } } },
      });
      await prisma.masterCourse.deleteMany({
        where: { code: { in: ["DUP 112", "DUP 113"] } },
      });
    }
  });
});

describe("dashboard action required", () => {
  it("lists only Phase 2 bulletins for a Dean, including returned ones", async () => {
    const cycleIds = ["test-cycle-act-1", "test-cycle-act-2", "test-cycle-act-3"];
    await prisma.reviewCycle.createMany({
      data: cycleIds.map((id) => ({ id, name: id, createdById: ids.super })),
    });
    const rows = [
      { cycleId: cycleIds[0], currentPhase: 2, status: "IN_REVIEW" as const },
      { cycleId: cycleIds[1], currentPhase: 2, status: "CORRECTIONS_REQUIRED" as const },
      { cycleId: cycleIds[2], currentPhase: 3, status: "IN_REVIEW" as const },
    ];
    await prisma.submission.createMany({
      data: rows.map((row, i) => ({
        id: `test-action-${i}`,
        title: `Action ${i}`,
        programmeId: ids.programmeA,
        createdById: ids.hod,
        ...row,
      })),
    });
    try {
      authState.userId = ids.dean;
      const deanStats = await (
        await getDashboardStats(new Request("http://localhost/api/dashboard/stats"))
      ).json();
      expect(
        deanStats.actionRequired.items
          .map((item: { id: string }) => item.id)
          .filter((id: string) => id.startsWith("test-action-"))
          .sort(),
      ).toEqual(["test-action-0", "test-action-1"]);

      // Phase 2 corrections belong to the Dean, not the department.
      authState.userId = ids.hod;
      const hodStats = await (
        await getDashboardStats(new Request("http://localhost/api/dashboard/stats"))
      ).json();
      expect(
        hodStats.actionRequired.items.map((item: { id: string }) => item.id),
      ).not.toContain("test-action-1");
    } finally {
      await prisma.submission.deleteMany({ where: { id: { startsWith: "test-action-" } } });
      await prisma.reviewCycle.deleteMany({ where: { id: { in: cycleIds } } });
    }
  });
});

describe("HOD browsing within their school", () => {
  const sibling = {
    department: "test-department-a2",
    programme: "test-programme-a2",
    submission: "test-submission-a2",
    outside: "test-submission-b",
    cycle: "test-cycle-browse",
  };

  beforeAll(async () => {
    // Own cycle, so these don't clash with submissions left by earlier tests.
    await prisma.reviewCycle.create({
      data: { id: sibling.cycle, name: sibling.cycle, createdById: ids.super },
    });
    await prisma.submission.create({
      data: { id: "test-submission-a-browse", title: "Own", programmeId: ids.programmeA, createdById: ids.hod, cycleId: sibling.cycle, status: "DRAFT" },
    });
    await prisma.department.create({
      data: { id: sibling.department, name: "Test Department A2", code: "TDA2", schoolId: ids.schoolA },
    });
    await prisma.programme.create({
      data: { id: sibling.programme, name: "Test Programme A2", code: "TPA2", departmentId: sibling.department },
    });
    await prisma.submission.createMany({
      data: [
        { id: sibling.submission, title: "Sibling", programmeId: sibling.programme, createdById: ids.super, cycleId: sibling.cycle, status: "DRAFT" },
        { id: sibling.outside, title: "Other school", programmeId: ids.programmeB, createdById: ids.super, cycleId: sibling.cycle, status: "DRAFT" },
      ],
    });
    await prisma.comment.create({
      data: { submissionId: sibling.submission, authorId: ids.dean, content: "Internal note", type: "ISSUE", phase: 1 },
    });
  });

  afterAll(async () => {
    await prisma.comment.deleteMany({ where: { submissionId: sibling.submission } });
    await prisma.submission.deleteMany({ where: { cycleId: sibling.cycle } });
    await prisma.reviewCycle.deleteMany({ where: { id: sibling.cycle } });
    await prisma.programme.deleteMany({ where: { id: sibling.programme } });
    await prisma.department.deleteMany({ where: { id: sibling.department } });
  });

  it("can read but not edit or comment on another department's bulletin in the school", async () => {
    authState.userId = ids.hod;
    const hod = (await getApiUser())!;
    expect(await canReadSubmission(hod, sibling.submission)).toBe(true);
    expect(await canViewSubmission(hod, sibling.submission)).toBe(false);
    expect(await canWriteSubmission(hod, sibling.submission)).toBe(false);
    expect(await canReadSubmission(hod, sibling.outside)).toBe(false);

    const response = await getSubmission(
      new NextRequest(`http://localhost/api/submissions/${sibling.submission}`),
      { params: Promise.resolve({ id: sibling.submission }) },
    );
    expect(response.status).toBe(200);
    const browsed = await response.json();
    expect(browsed.comments).toEqual([]);
    // A draft at Phase 1 belongs to HODs by role, but not this one: the page
    // gets no actions and no editing, and Submit is refused if called directly.
    expect(browsed.workflow).toEqual({
      actions: [],
      canEdit: false,
      clearedPreviousGate: false,
      requiredEvidence: null,
      graceGate: null,
      submitClosed: null,
      override: null,
    });
    const submit = await transitionSubmission(
      new NextRequest(`http://localhost/api/submissions/${sibling.submission}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SUBMIT" }),
      }),
      { params: Promise.resolve({ id: sibling.submission }) },
    );
    expect(submit.status).toBe(403);

    const comment = await createComment(
      new NextRequest(`http://localhost/api/submissions/${sibling.submission}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Not mine", type: "QUESTION" }),
      }),
      { params: Promise.resolve({ id: sibling.submission }) },
    );
    expect(comment.status).toBe(403);
  });

  it("lists the school only when asked, and never another school", async () => {
    authState.userId = ids.hod;
    const listIds = async (query: string) =>
      ((await (await listSubmissions(new NextRequest(`http://localhost/api/submissions?cycleId=${sibling.cycle}${query}`))).json()) as { id: string }[]).map((row) => row.id);

    const own = await listIds("");
    expect(own).toContain("test-submission-a-browse");
    expect(own).not.toContain(sibling.submission);

    const school = await listIds("&scope=school");
    expect(school).toEqual(expect.arrayContaining(["test-submission-a-browse", sibling.submission]));
    expect(school).not.toContain(sibling.outside);

    // A schoolId in the URL no longer widens an HOD's list.
    const spoofed = await listIds(`&schoolId=${ids.schoolB}`);
    expect(spoofed).not.toContain(sibling.outside);
    expect(spoofed).toContain("test-submission-a-browse");
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

      // The right caller at the right phase gets as far as the GRACE gate:
      // the unchecked course stops the approval until it has a passing result.
      authState.userId = ids.admin;
      const unchecked = await transition(submission.id, "APPROVE");
      expect(unchecked.status).toBe(409);
      expect(await unchecked.json()).toMatchObject({
        code: "GRACE_APPROVAL_BLOCKED",
        blockers: { missing: ["PGT 101"] },
      });
      await prisma.course.deleteMany({ where: { submissionId: submission.id } });
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

  it("W6: refuses a minimum CGPA below 2.00 when saving and at Submit", async () => {
    const refused = await save({ minimumCGPA: 1.5 });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: "CGPA_OUT_OF_RANGE" });
    expect((await save({ minimumCGPA: 2 })).status).toBe(200);

    // A figure stored before the rule is still caught at Submit.
    await prepareDraftForSubmit(submissionId);
    await prisma.submissionContent.update({ where: { submissionId }, data: { minimumCGPA: 1.5 } });
    expect(await refusalCodes()).toEqual(["CGPA_OUT_OF_RANGE"]);
  });

  it("F0: Submit to School waits for the cycle's opening date, on the server and the page", async () => {
    await prepareDraftForSubmit(submissionId);
    const opensAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.reviewCycle.update({ where: { id: cycleId }, data: { submissionsOpenAt: opensAt } });
    try {
      const early = await submit();
      expect(early.status).toBe(409);
      const body = await early.json();
      expect(body.code).toBe("SUBMISSIONS_NOT_OPEN");
      expect(body.error).toMatch(/^Submissions open on \w+day, \w+ \d{1,2}, \d{4}\. Keep working; your draft saves as you go\.$/);
      expect(await stage()).toEqual({ currentPhase: 1, status: "DRAFT" });

      // The page gets the same answer, so it can show the button switched off.
      authState.userId = ids.hod;
      const page = await getSubmission(
        new NextRequest(`http://localhost/api/submissions/${submissionId}`),
        { params: Promise.resolve({ id: submissionId }) },
      );
      const { workflow } = await page.json();
      expect(workflow.actions).toContain("SUBMIT");
      expect(workflow.submitClosed).toEqual({ opensAt: opensAt.toISOString(), message: body.error });

      // DAP opens submissions earlier by moving the date.
      await prisma.reviewCycle.update({
        where: { id: cycleId },
        data: { submissionsOpenAt: new Date(Date.now() - 1000) },
      });
      expect((await submit()).status).toBe(200);
      expect(await stage()).toEqual({ currentPhase: 2, status: "IN_REVIEW" });
    } finally {
      await prisma.reviewCycle.update({ where: { id: cycleId }, data: { submissionsOpenAt: null } });
    }
  });

  it("Q7: a course row and a comment go only once DELETE is typed", async () => {
    const course = await prisma.course.create({
      data: { submissionId, code: "Q7T 101", title: "Typed delete", units: 2, semester: 1, level: 100 },
    });
    const comment = await prisma.comment.create({
      data: { submissionId, authorId: ids.hod, content: "Remove me", phase: 1 },
    });
    authState.userId = ids.hod;
    const removeCourse = (confirm?: string) =>
      deleteCourseRow(
        new NextRequest(`http://localhost/api/courses/${course.id}`, {
          method: "DELETE",
          ...(confirm !== undefined && { body: JSON.stringify({ confirm }) }),
        }),
        { params: Promise.resolve({ id: course.id }) },
      );
    const removeComment = (confirm?: string) =>
      deleteComment(
        new NextRequest(`http://localhost/api/submissions/${submissionId}/comments/${comment.id}`, {
          method: "DELETE",
          ...(confirm !== undefined && { body: JSON.stringify({ confirm }) }),
        }),
        { params: Promise.resolve({ id: submissionId, commentId: comment.id }) },
      );

    const unconfirmed = await removeCourse();
    expect(unconfirmed.status).toBe(400);
    expect(await unconfirmed.json()).toMatchObject({ code: "CONFIRMATION_REQUIRED", confirmText: "DELETE" });
    expect((await removeCourse("Q7T 101")).status).toBe(400);
    expect(await prisma.course.count({ where: { id: course.id } })).toBe(1);
    expect((await removeCourse("delete")).status).toBe(200);
    expect(await prisma.course.count({ where: { id: course.id } })).toBe(0);
    expect(
      await prisma.activityLog.count({ where: { action: "COURSE_DELETED", metadata: { path: ["courseId"], equals: course.id } } }),
    ).toBe(1);

    expect((await removeComment()).status).toBe(400);
    expect(await prisma.comment.count({ where: { id: comment.id } })).toBe(1);
    expect((await removeComment("DELETE")).status).toBe(200);
    expect(await prisma.comment.count({ where: { id: comment.id } })).toBe(0);
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
        email: `${secondAdmin}@babcock.edu.ng`,
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
        body: JSON.stringify({ action, ...overrideFor(userId), ...extra }),
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

// The workflow ledger: one permanent row per state change, written with it.
describe("workflow ledger", () => {
  const cycleId = "ledger-cycle";
  const submissionId = "ledger-submission";
  const guardMigration = join(
    process.cwd(),
    "prisma/migrations/20261105140100_ledger_guards/migration.sql",
  );
  // Raw SQL on its own connection: the guard migration is several statements.
  const sql = async (text: string) => {
    const client = new PgClient({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(text);
    } finally {
      await client.end();
    }
  };
  const removeGuards = () =>
    sql(`
      DROP TRIGGER IF EXISTS phase_transitions_append_only ON "phase_transitions";
      DROP TRIGGER IF EXISTS submissions_state_requires_ledger ON "submissions";
      DROP FUNCTION IF EXISTS phase_transitions_append_only();
      DROP FUNCTION IF EXISTS submissions_state_requires_ledger();
      DROP FUNCTION IF EXISTS ledger_maintenance_enabled();
    `);

  beforeAll(async () => {
    await prisma.reviewCycle.create({
      data: { id: cycleId, name: "Ledger", createdById: ids.super },
    });
  });

  beforeEach(async () => {
    await prisma.submission.deleteMany({ where: { id: submissionId } });
    await prisma.submission.create({
      data: {
        id: submissionId,
        title: "Ledger Bulletin",
        programmeId: ids.programmeA,
        createdById: ids.hod,
        cycleId,
      },
    });
    await prepareDraftForSubmit(submissionId);
  });

  afterAll(async () => {
    await removeGuards();
    await prisma.submission.deleteMany({ where: { id: submissionId } });
    await prisma.reviewCycle.deleteMany({ where: { id: cycleId } });
  });

  const act = (userId: string, action: string, remarks?: string) => {
    authState.userId = userId;
    return transitionSubmission(
      new NextRequest(`http://localhost/api/submissions/${submissionId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, remarks, ...overrideFor(userId) }),
      }),
      { params: Promise.resolve({ id: submissionId }) },
    );
  };

  it("writes one row per state change, with the actor's role and the text version", async () => {
    expect((await act(ids.hod, "SUBMIT")).status).toBe(200);
    expect((await act(ids.dean, "APPROVE")).status).toBe(200);
    expect((await act(ids.admin, "RETURN", "Clarify the mission.")).status).toBe(200);
    // The School revises the text before sending it on again.
    await prisma.submissionContent.update({
      where: { submissionId },
      data: { mission: "To form graduates of character and service." },
    });
    expect((await act(ids.dean, "SUBMIT")).status).toBe(200);
    // A refused action leaves no row.
    expect((await act(ids.dean, "APPROVE")).status).toBe(403);

    const ledger = await prisma.phaseTransition.findMany({
      where: { submissionId },
      orderBy: { transitionedAt: "asc" },
      select: {
        id: true,
        action: true,
        fromPhase: true,
        toPhase: true,
        actorRole: true,
        performedById: true,
        contentHash: true,
      },
    });
    expect(ledger.map(({ action, fromPhase, toPhase, actorRole }) => ({
      action,
      fromPhase,
      toPhase,
      actorRole,
    }))).toEqual([
      { action: "SUBMIT", fromPhase: 1, toPhase: 2, actorRole: "HOD" },
      { action: "APPROVE", fromPhase: 2, toPhase: 3, actorRole: "DEAN" },
      { action: "RETURN", fromPhase: 3, toPhase: 2, actorRole: "ADMIN" },
      { action: "SUBMIT", fromPhase: 2, toPhase: 3, actorRole: "DEAN" },
    ]);

    // The text version only changes when the text does.
    const [submitted, approved, returned, resubmitted] = ledger.map((row) => row.contentHash);
    expect(submitted).toMatch(/^[0-9a-f]{64}$/);
    expect(approved).toBe(submitted);
    expect(returned).toBe(submitted);
    expect(resubmitted).not.toBe(submitted);
    expect(resubmitted).toBe(await bulletinContentHash(prisma, submissionId));

    // Each ledger row has exactly one Activity Log entry pointing back to it.
    const activity = await prisma.activityLog.findMany({
      where: { entityId: submissionId, action: { startsWith: "SUBMISSION_" } },
      select: { metadata: true },
    });
    expect(
      activity
        .map((entry) => (entry.metadata as { transitionId?: string } | null)?.transitionId)
        .sort(),
    ).toEqual(ledger.map((row) => row.id).sort());
  });

  it("refuses to edit or delete ledger rows, or to move a bulletin without one", async () => {
    await sql(readFileSync(guardMigration, "utf8"));
    try {
      // The workflow itself still works with the guards in place.
      expect((await act(ids.hod, "SUBMIT")).status).toBe(200);
      const row = await prisma.phaseTransition.findFirstOrThrow({ where: { submissionId } });

      await expect(
        prisma.phaseTransition.update({ where: { id: row.id }, data: { remarks: "Edited" } }),
      ).rejects.toThrow(/append-only/);
      await expect(
        prisma.phaseTransition.delete({ where: { id: row.id } }),
      ).rejects.toThrow(/append-only/);

      // A phase or status can't be changed directly, but other fields can.
      await expect(
        prisma.submission.update({ where: { id: submissionId }, data: { currentPhase: 5 } }),
      ).rejects.toThrow(/phase_transitions row/);
      await expect(
        prisma.submission.update({ where: { id: submissionId }, data: { status: "APPROVED" } }),
      ).rejects.toThrow(/phase_transitions row/);
      await prisma.submission.update({ where: { id: submissionId }, data: { title: "Renamed" } });

      // A bulletin with history can't be deleted, by the API or by the database.
      authState.userId = ids.super;
      const deletion = await deleteSubmission(
        new NextRequest(`http://localhost/api/submissions/${submissionId}`, { method: "DELETE" }),
        { params: Promise.resolve({ id: submissionId }) },
      );
      expect(deletion.status).toBe(409);
      expect(await deletion.json()).toMatchObject({ code: "HAS_WORKFLOW_HISTORY" });
      await expect(
        prisma.submission.delete({ where: { id: submissionId } }),
      ).rejects.toThrow(/append-only/);

      // Nor can the programme, department or school it sits in, since
      // deleting those deletes the bulletin too. Nothing is removed.
      for (const [remove, unit, id] of [
        [deleteProgramme, "programmes", ids.programmeA],
        [deleteDepartment, "departments", ids.departmentA],
        [deleteSchool, "schools", ids.schoolA],
      ] as const) {
        const refused = await remove(
          new NextRequest(`http://localhost/api/${unit}/${id}`, { method: "DELETE" }),
          { params: Promise.resolve({ id }) },
        );
        expect(refused.status).toBe(409);
        expect(await refused.json()).toMatchObject({
          code: "HAS_WORKFLOW_HISTORY",
          error: expect.stringContaining("workflow history"),
        });
      }
      expect(await prisma.programme.count({ where: { id: ids.programmeA } })).toBe(1);
      expect(await prisma.school.count({ where: { id: ids.schoolA } })).toBe(1);

      expect(
        await prisma.submission.findUniqueOrThrow({
          where: { id: submissionId },
          select: { currentPhase: true, status: true },
        }),
      ).toEqual({ currentPhase: 2, status: "IN_REVIEW" });
      expect(await prisma.phaseTransition.count({ where: { submissionId } })).toBe(1);

      // A deliberate repair names itself; this also cleans up the test record.
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL app.ledger_maintenance = 'on'`;
        await tx.submission.delete({ where: { id: submissionId } });
      });
      expect(await prisma.phaseTransition.count({ where: { submissionId } })).toBe(0);
    } finally {
      await removeGuards();
    }
  });

  it("refuses a programme with bulletins, and archives it once it has none", async () => {
    const programmeId = "ledger-empty-programme";
    await prisma.programme.create({
      data: { id: programmeId, name: "Ledger Empty", code: "LEP", departmentId: ids.departmentA },
    });
    await prisma.submission.create({
      data: {
        id: "ledger-empty-draft",
        title: "Untouched Draft",
        programmeId,
        createdById: ids.hod,
        cycleId,
      },
    });
    const removeProgramme = (confirm?: string) =>
      deleteProgramme(
        new NextRequest(`http://localhost/api/programmes/${programmeId}`, {
          method: "DELETE",
          ...(confirm !== undefined && { body: JSON.stringify({ confirm }) }),
        }),
        { params: Promise.resolve({ id: programmeId }) },
      );
    authState.userId = ids.super;

    // Deleting it would delete the bulletin too, even one that never moved.
    const refused = await removeProgramme("DELETE");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: "IN_USE", reasons: ["It has 1 bulletin."] });
    expect(await prisma.submission.count({ where: { id: "ledger-empty-draft" } })).toBe(1);

    await prisma.submission.delete({ where: { id: "ledger-empty-draft" } });
    expect((await removeProgramme()).status).toBe(400);
    expect((await removeProgramme("Ledger Empty")).status).toBe(400);
    expect((await removeProgramme("DELETE")).status).toBe(200);
    expect(await prisma.programme.count({ where: { id: programmeId } })).toBe(0);
    expect(
      await prisma.archivedRecord.findFirstOrThrow({ where: { entityId: programmeId } }),
    ).toMatchObject({ entityType: "PROGRAMME", label: "Ledger Empty" });
  });

  it("deletes a draft only while nothing has been written in it", async () => {
    authState.userId = ids.super;
    const removeDraft = (confirm?: string) =>
      deleteSubmission(
        new NextRequest(`http://localhost/api/submissions/${submissionId}`, {
          method: "DELETE",
          ...(confirm !== undefined && { body: JSON.stringify({ confirm }) }),
        }),
        { params: Promise.resolve({ id: submissionId }) },
      );

    // The prepared draft has courses and written sections.
    const refused = await removeDraft("DELETE");
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("IN_USE");
    expect(await prisma.submission.count({ where: { id: submissionId } })).toBe(1);

    // Emptied, it can go once DELETE is typed.
    await prisma.course.deleteMany({ where: { submissionId } });
    await prisma.comment.deleteMany({ where: { submissionId } });
    await prisma.submissionContent.deleteMany({ where: { submissionId } });
    const unconfirmed = await removeDraft();
    expect(unconfirmed.status).toBe(400);
    expect(await unconfirmed.json()).toMatchObject({ confirmText: "DELETE" });
    expect((await removeDraft("deleted")).status).toBe(400);
    expect((await removeDraft("delete")).status).toBe(200);
    expect(await prisma.submission.count({ where: { id: submissionId } })).toBe(0);
  });
});

describe("Google sign-in", () => {
  it("admits only verified emails an administrator added, in any letter case", async () => {
    const hod = await prisma.user.findUniqueOrThrow({ where: { id: ids.hod } });
    const hd = "babcock.edu.ng";
    expect(
      await allowGoogleSignIn({ email: hod.email.toUpperCase(), email_verified: true, hd }),
    ).toBe(true);
    expect(await allowGoogleSignIn({ email: hod.email, email_verified: false, hd })).toBe(
      "/login?error=not_authorized",
    );
    expect(
      await allowGoogleSignIn({ email: "nobody@babcock.edu.ng", email_verified: true, hd }),
    ).toBe("/login?error=not_authorized");

    const inactive = await prisma.user.findUniqueOrThrow({ where: { id: ids.inactive } });
    expect(await allowGoogleSignIn({ email: inactive.email, email_verified: true, hd })).toBe(
      "/login?error=account_deactivated",
    );
  });

  it("links the session to the existing user id and ends it once deactivated", async () => {
    const hod = await prisma.user.findUniqueOrThrow({ where: { id: ids.hod } });
    const start = 1_000_000;
    const token = await refreshSessionToken({}, { email: hod.email }, start);
    expect(token).toMatchObject({ userId: ids.hod, checkedAt: start });

    await prisma.user.update({ where: { id: ids.hod }, data: { isActive: false } });
    try {
      // Within the re-check window the token is trusted as is...
      expect(await refreshSessionToken(token!, undefined, start + 1000)).toBe(token);
      // ...after it, a deactivated account loses its session.
      expect(await refreshSessionToken(token!, undefined, start + RECHECK_MS + 1)).toBeNull();
    } finally {
      await prisma.user.update({ where: { id: ids.hod }, data: { isActive: true } });
    }
    expect(
      await refreshSessionToken(token!, undefined, start + RECHECK_MS + 1),
    ).toMatchObject({ userId: ids.hod, checkedAt: start + RECHECK_MS + 1 });
  });
});

// GRACE checks run on save or Submit, never because someone opened a page,
// and the endpoints that spend AI credits are limited per person.
describe("GRACE checks on save and submit", () => {
  const draftCycle = "grace-draft-cycle";
  const reviewCycle = "grace-review-cycle";
  const draftId = "grace-draft-submission";
  const reviewId = "grace-review-submission";
  const words = (count: number, word = "topic") =>
    Array.from({ length: count }, (_, index) => `${word}${index + 1}`).join(" ");
  const learningOutcomes = ["Explain the core ideas of the course"];
  let previousKey: string | undefined;

  beforeAll(async () => {
    // No AI service here: texts under the minimum length get the
    // minimum-length result, which needs no model call.
    previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "";
    await prisma.reviewCycle.createMany({
      data: [
        { id: draftCycle, name: "GRACE Draft", createdById: ids.super },
        { id: reviewCycle, name: "GRACE Review", createdById: ids.super },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.apiRateLimit.deleteMany({});
    vi.mocked(after).mockClear();
    await prisma.submission.deleteMany({ where: { id: { in: [draftId, reviewId] } } });
    await prisma.submission.create({
      data: {
        id: draftId,
        title: "GRACE Draft Bulletin",
        programmeId: ids.programmeA,
        createdById: ids.hod,
        cycleId: draftCycle,
      },
    });
    // With Academic Planning, which the Registry preload leaves alone.
    await prisma.submission.create({
      data: {
        id: reviewId,
        title: "GRACE Review Bulletin",
        programmeId: ids.programmeA,
        createdById: ids.hod,
        cycleId: reviewCycle,
        currentPhase: 3,
        status: "IN_REVIEW",
      },
    });
  });

  afterAll(async () => {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    await prisma.apiRateLimit.deleteMany({});
    await prisma.submission.deleteMany({ where: { id: { in: [draftId, reviewId] } } });
    await prisma.reviewCycle.deleteMany({ where: { id: { in: [draftCycle, reviewCycle] } } });
  });

  /** A course whose description is saved and queued, as autosave leaves it. */
  const queuedCourse = async (
    submissionId: string,
    code: string,
    courseContent = words(20),
  ) => {
    const course = await prisma.course.create({
      data: { code, title: `Queued ${code}`, units: 2, semester: 1, level: 100, submissionId },
    });
    const contentHash = courseGraceContentHash({
      title: course.title,
      learningOutcomes,
      courseContent,
    })!;
    await prisma.graceAssessment.upsert({
      where: { contentHash },
      update: {},
      create: { contentHash, title: course.title, courseContent, learningOutcomes },
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
    return { course, contentHash };
  };

  const processQueue = (userId: string, submissionId = draftId) => {
    authState.userId = userId;
    return processGraceQueue(
      new NextRequest("http://localhost/api/grace-check/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      }),
    );
  };

  const submit = () => {
    authState.userId = ids.hod;
    return transitionSubmission(
      new NextRequest(`http://localhost/api/submissions/${draftId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "SUBMIT" }),
      }),
      { params: Promise.resolve({ id: draftId }) },
    );
  };

  /** Uses up a person's allowance now and in the next window. */
  const exhaust = async (name: keyof typeof AI_RATE_LIMITS, userId: string) => {
    const { limit, windowSeconds } = AI_RATE_LIMITS[name];
    const windowMs = windowSeconds * 1000;
    const window = Math.floor(Date.now() / windowMs);
    for (const w of [window, window + 1]) {
      const key = `${name}:${userId}:${w}`;
      await prisma.apiRateLimit.upsert({
        where: { key },
        update: { count: limit },
        create: { key, count: limit, expiresAt: new Date((w + 1) * windowMs) },
      });
    }
  };

  it("runs and rewrites nothing when a reviewer opens the course list", async () => {
    const { course, contentHash } = await queuedCourse(reviewId, "GQ 101");
    // The text changed after a pass was stored, so that pass is stale.
    const edited = words(20, "edited");
    await prisma.courseDescription.update({
      where: { courseId: course.id },
      data: { courseContent: edited, graceStatus: "COMPLIANT", gracePass: true },
    });
    const before = await prisma.courseDescription.findUniqueOrThrow({
      where: { courseId: course.id },
    });

    for (const reviewer of [ids.admin, ids.dean]) {
      authState.userId = reviewer;
      const list = await listCourses(
        new NextRequest(`http://localhost/api/courses?submissionId=${reviewId}`),
      );
      expect(list.status).toBe(200);
      const listed = ((await list.json()) as Array<{ id: string; description: unknown }>)
        .find((item) => item.id === course.id);
      // Shown as waiting for a check, not as the stale pass.
      expect(listed?.description).toMatchObject({
        graceStatus: "PENDING",
        gracePass: false,
        graceResult: null,
      });

      const progress = await readGraceProgress(
        new NextRequest(`http://localhost/api/grace-check/progress?submissionId=${reviewId}`),
      );
      expect(progress.status).toBe(200);
      expect((await progress.json()).progress).toMatchObject({
        total: 1,
        pending: 1,
        compliant: 0,
        checking: 0,
      });
    }

    // A reviewer who can't edit can't run the queue either.
    const refused = await processQueue(ids.dean, reviewId);
    expect(refused.status).toBe(403);

    // Nothing was queued, claimed or rewritten.
    expect(
      await prisma.courseDescription.findUniqueOrThrow({ where: { courseId: course.id } }),
    ).toEqual(before);
    const editedHash = courseGraceContentHash({
      title: course.title,
      learningOutcomes,
      courseContent: edited,
    })!;
    expect(await prisma.graceAssessment.count({ where: { contentHash: editedHash } })).toBe(0);
    expect(
      (await prisma.graceAssessment.findUniqueOrThrow({ where: { contentHash } })).status,
    ).toBe("PENDING");
    expect(await prisma.apiRateLimit.count()).toBe(0);
  });

  it("lets editors run the queue, records what scored each result, and throttles", async () => {
    const { course, contentHash } = await queuedCourse(draftId, "GQ 201");

    expect((await processQueue(ids.dean)).status).toBe(403);
    expect(
      (await prisma.graceAssessment.findUniqueOrThrow({ where: { contentHash } })).status,
    ).toBe("PENDING");

    const ran = await processQueue(ids.hod);
    expect(ran.status).toBe(200);
    expect(await ran.json()).toMatchObject({ processed: 1 });

    // The stored result names the text, the model and the rubric behind it.
    const assessment = await prisma.graceAssessment.findUniqueOrThrow({ where: { contentHash } });
    expect(assessment.status).toBe("NEEDS_REVISION");
    expect(assessment.result).toMatchObject({
      contentHash,
      modelUsed: null,
      rubricVersion: GRACE_RUBRIC_VERSION,
      passed: false,
    });
    expect(
      await prisma.courseDescription.findUniqueOrThrow({
        where: { courseId: course.id },
        select: { graceStatus: true, graceResult: true },
      }),
    ).toMatchObject({
      graceStatus: "NEEDS_REVISION",
      graceResult: { contentHash, rubricVersion: GRACE_RUBRIC_VERSION },
    });

    // Called directly and repeatedly, the queue stops at the limit.
    await exhaust("graceQueue", ids.hod);
    const throttled = await processQueue(ids.hod);
    expect(throttled.status).toBe(429);
    expect(Number(throttled.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await throttled.json()).toMatchObject({ code: "RATE_LIMITED" });
  });

  it("limits each person separately, per window, and prunes old counts", async () => {
    const { limit } = AI_RATE_LIMITS.graceCheck;
    const now = new Date("2026-11-17T10:00:30.000Z");
    for (let call = 0; call < limit; call += 1) {
      expect((await takeRateLimit("graceCheck", ids.hod, now)).ok).toBe(true);
    }
    expect(await takeRateLimit("graceCheck", ids.hod, now)).toEqual({
      ok: false,
      retryAfterSeconds: 30,
      count: limit + 1,
    });
    // Someone else, and the next window, are unaffected.
    expect((await takeRateLimit("graceCheck", ids.coordinator, now)).ok).toBe(true);
    expect(
      (await takeRateLimit("graceCheck", ids.hod, new Date("2026-11-17T10:01:00.000Z"))).ok,
    ).toBe(true);

    expect(await pruneRateLimits(new Date("2026-11-17T10:01:30.000Z"))).toBe(2);
    expect(await prisma.apiRateLimit.count()).toBe(1);
  });

  it("throttles the single GRACE check without running it", async () => {
    await exhaust("graceCheck", ids.hod);
    authState.userId = ids.hod;
    const response = await checkGrace(
      new NextRequest("http://localhost/api/grace-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "philosophy",
          submissionId: draftId,
          title: "Philosophy",
          content: words(20),
        }),
      }),
    );
    expect(response.status).toBe(429);
    expect(
      await prisma.submissionContent.findUnique({
        where: { submissionId: draftId },
        select: { philosophyGrace: true },
      }),
    ).toBeNull();
  });

  it("starts the waiting checks when Submit is refused for them", async () => {
    const { contentHash } = await queuedCourse(draftId, "GQ 301");
    await prepareDraftForSubmit(draftId);

    const refused = await submit();
    expect(refused.status).toBe(409);
    const body = await refused.json();
    expect(body).toMatchObject({ code: "GRACE_COMPLIANCE_REQUIRED", gracePending: true });
    expect(body.issues).toContain(
      "GRACE checks have started for the courses still waiting. Try submitting again in a few minutes.",
    );

    // The checks run after the response, not while the person waits.
    expect(vi.mocked(after)).toHaveBeenCalledTimes(1);
    expect(
      (await prisma.graceAssessment.findUniqueOrThrow({ where: { contentHash } })).status,
    ).toBe("PENDING");
    const scheduled = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await scheduled();
    expect(
      await prisma.graceAssessment.findUniqueOrThrow({
        where: { contentHash },
        select: { status: true, result: true },
      }),
    ).toMatchObject({
      status: "NEEDS_REVISION",
      result: { contentHash, rubricVersion: GRACE_RUBRIC_VERSION },
    });

    // Over the limit, Submit is still refused but starts nothing more.
    await prisma.course.deleteMany({ where: { submissionId: draftId, code: "GQ 301" } });
    await queuedCourse(draftId, "GQ 302");
    vi.mocked(after).mockClear();
    await exhaust("graceQueue", ids.hod);
    const again = await submit();
    expect(again.status).toBe(409);
    expect((await again.json()).gracePending).toBeUndefined();
    expect(vi.mocked(after)).not.toHaveBeenCalled();
  });

  it("still refuses Submit normally when the checks can't be counted", async () => {
    await prisma.course.deleteMany({ where: { submissionId: draftId } });
    await queuedCourse(draftId, "GQ 401");
    await prepareDraftForSubmit(draftId);
    await prisma.apiRateLimit.deleteMany({});
    vi.mocked(after).mockClear();
    // As on a database where the rate-limit table hasn't been created yet.
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "api_rate_limits" RENAME TO "api_rate_limits_unavailable"',
    );
    try {
      const refused = await submit();
      expect(refused.status).toBe(409);
      const body = await refused.json();
      expect(body.code).toBe("GRACE_COMPLIANCE_REQUIRED");
      expect(body.gracePending).toBeUndefined();
      expect(vi.mocked(after)).not.toHaveBeenCalled();
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "api_rate_limits_unavailable" RENAME TO "api_rate_limits"',
      );
    }
  });
});

describe("Deleting into the Archive", () => {
  type Handler = (
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
  ) => Promise<Response>;
  const remove = (handler: Handler, path: string, id: string, confirm?: string) =>
    handler(
      new NextRequest(`http://localhost${path}/${id}`, {
        method: "DELETE",
        ...(confirm !== undefined && {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm }),
        }),
      }),
      { params: Promise.resolve({ id }) },
    );
  const restore = (archiveId: string) =>
    restoreArchived(
      new NextRequest(`http://localhost/api/archive/${archiveId}/restore`, { method: "POST" }),
      { params: Promise.resolve({ id: archiveId }) },
    );
  const archived = (entityId: string) =>
    prisma.archivedRecord.findFirstOrThrow({ where: { entityId } });
  const staffFields = {
    title: "DR",
    gender: "FEMALE",
    surname: "okafor",
    firstName: "ada",
    highestQualification: "PHD",
    academicRank: "LECTURER_I",
    type: "ACADEMIC",
  } as const;

  afterAll(async () => {
    await prisma.archivedRecord.deleteMany({});
    await prisma.submission.deleteMany({ where: { id: { startsWith: "arc-" } } });
    await prisma.reviewCycle.deleteMany({ where: { id: { startsWith: "arc-" } } });
    await prisma.staff.deleteMany({ where: { id: { startsWith: "arc-" } } });
    await prisma.masterCourse.deleteMany({ where: { id: "arc-course" } });
    await prisma.masterCourse.deleteMany({ where: { id: { startsWith: "arc-" } } });
    await prisma.department.deleteMany({ where: { id: { startsWith: "arc-" } } });
    await prisma.school.deleteMany({ where: { id: { startsWith: "arc-" } } });
  });

  it("matches the typed name ignoring case and extra spaces", () => {
    expect(confirmationMatches("  test   SCHOOL a ", "Test School A")).toBe(true);
    expect(confirmationMatches("Test School", "Test School A")).toBe(false);
    expect(confirmationMatches("   ", "   ")).toBe(false);
    expect(confirmationMatches(undefined, "Test School A")).toBe(false);
  });

  it("refuses a school that is still in use, even with DELETE typed", async () => {
    await prisma.school.create({ data: { id: "arc-used", name: "Used School", code: "USD" } });
    await prisma.department.create({
      data: { id: "arc-used-dept", name: "Used Department", code: "USDD", schoolId: "arc-used" },
    });
    authState.userId = ids.admin;
    const refused = await remove(deleteSchool, "/api/schools", "arc-used", "DELETE");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      code: "IN_USE",
      reasons: ["It has 1 department."],
    });
    expect(await prisma.school.count({ where: { id: "arc-used" } })).toBe(1);
    expect(await prisma.department.count({ where: { id: "arc-used-dept" } })).toBe(1);
    expect(await prisma.archivedRecord.count({ where: { entityId: "arc-used" } })).toBe(0);
  });

  it("asks for DELETE, then archives an unused school and restores it with the same id", async () => {
    await prisma.school.create({ data: { id: "arc-school", name: "Archive Test School", code: "ARC" } });

    authState.userId = ids.hod;
    expect(
      (await remove(deleteSchool, "/api/schools", "arc-school", "DELETE")).status,
    ).toBe(403);

    authState.userId = ids.admin;
    const check = await remove(deleteSchool, "/api/schools", "arc-school");
    expect(check.status).toBe(400);
    expect(await check.json()).toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      confirmText: "DELETE",
    });
    // The school's name is no longer what is asked for, nor a near miss.
    expect((await remove(deleteSchool, "/api/schools", "arc-school", "Archive Test School")).status).toBe(400);
    expect((await remove(deleteSchool, "/api/schools", "arc-school", "delet")).status).toBe(400);
    expect(await prisma.school.count({ where: { id: "arc-school" } })).toBe(1);

    const deleted = await remove(deleteSchool, "/api/schools", "arc-school", "  Delete ");
    expect(deleted.status).toBe(200);
    expect(await prisma.school.count({ where: { id: "arc-school" } })).toBe(0);
    const record = await archived("arc-school");
    expect(record).toMatchObject({
      entityType: "SCHOOL",
      label: "Archive Test School",
      archivedById: ids.admin,
    });
    expect(
      await prisma.activityLog.count({ where: { entityId: "arc-school", action: "SCHOOL_DELETED" } }),
    ).toBe(1);

    // Only administrators see the Archive and restore from it.
    authState.userId = ids.hod;
    expect((await listArchive()).status).toBe(403);
    expect((await restore(record.id)).status).toBe(403);

    authState.userId = ids.admin;
    expect(await (await listArchive()).json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: record.id, label: "Archive Test School" }),
      ]),
    );
    expect((await restore(record.id)).status).toBe(200);
    expect(await prisma.school.findUniqueOrThrow({ where: { id: "arc-school" } })).toMatchObject({
      name: "Archive Test School",
      code: "ARC",
    });
    expect(await prisma.archivedRecord.count({ where: { id: record.id } })).toBe(0);
    expect(
      await prisma.activityLog.count({ where: { entityId: "arc-school", action: "SCHOOL_RESTORED" } }),
    ).toBe(1);
  });

  it("won't restore before the parent, or over a record that took its code", async () => {
    authState.userId = ids.admin;
    await prisma.department.create({
      data: { id: "arc-dept", name: "Archive Test Department", code: "ARCD", schoolId: "arc-school" },
    });
    expect(
      (await remove(deleteDepartment, "/api/departments", "arc-dept", "DELETE")).status,
    ).toBe(200);
    expect(
      (await remove(deleteSchool, "/api/schools", "arc-school", "DELETE")).status,
    ).toBe(200);

    const department = await archived("arc-dept");
    const early = await restore(department.id);
    expect(early.status).toBe(409);
    expect((await early.json()).error).toBe(
      "Its school, Archive Test School, is in the Archive. Restore the school first.",
    );

    // Meanwhile another school took the code.
    await prisma.school.create({ data: { id: "arc-taken", name: "Replacement School", code: "ARC" } });
    const school = await archived("arc-school");
    const clash = await restore(school.id);
    expect(clash.status).toBe(409);
    expect((await clash.json()).error).toMatch(/same name or code/);
    expect(await prisma.archivedRecord.count({ where: { id: school.id } })).toBe(1);

    await prisma.school.delete({ where: { id: "arc-taken" } });
    expect((await restore(school.id)).status).toBe(200);
    expect((await restore(department.id)).status).toBe(200);
    expect(await prisma.department.findUniqueOrThrow({ where: { id: "arc-dept" } })).toMatchObject({
      schoolId: "arc-school",
      code: "ARCD",
    });
  });

  it("keeps the active cycle and any cycle with bulletins", async () => {
    authState.userId = ids.admin;
    await prisma.reviewCycle.create({
      data: { id: "arc-cycle", name: "Archive Test Cycle", createdById: ids.super, isActive: false },
    });
    await prisma.reviewCycle.create({
      data: { id: "arc-cycle-used", name: "Used Cycle", createdById: ids.super, isActive: false },
    });
    await prisma.submission.create({
      data: {
        id: "arc-cycle-bulletin",
        title: "Cycle Bulletin",
        programmeId: ids.programmeB,
        createdById: ids.super,
        cycleId: "arc-cycle-used",
      },
    });

    const used = await remove(deleteCycle, "/api/cycles", "arc-cycle-used", "DELETE");
    expect(used.status).toBe(409);
    expect((await used.json()).reasons).toEqual(["It has 1 bulletin."]);

    await prisma.reviewCycle.update({ where: { id: "arc-cycle" }, data: { isActive: true } });
    const active = await remove(deleteCycle, "/api/cycles", "arc-cycle", "DELETE");
    expect(active.status).toBe(409);
    expect((await active.json()).reasons).toEqual([
      "It is the active review cycle. Close it first.",
    ]);
    await prisma.reviewCycle.update({
      where: { id: "arc-cycle" },
      data: { isActive: false, closedAt: new Date() },
    });

    expect(
      (await remove(deleteCycle, "/api/cycles", "arc-cycle", "DELETE")).status,
    ).toBe(200);
    expect((await restore((await archived("arc-cycle")).id)).status).toBe(200);
    expect(await prisma.reviewCycle.findUniqueOrThrow({ where: { id: "arc-cycle" } })).toMatchObject({
      name: "Archive Test Cycle",
      isActive: false,
      createdById: ids.super,
    });
  });

  it("archives a Registry course with its prerequisites, but not one another course needs", async () => {
    authState.userId = ids.admin;
    await prisma.masterCourse.create({
      data: { id: "arc-pre", code: "ARC 100", title: "Archive basics", units: 2, level: 100, semester: 1 },
    });
    await prisma.masterCourse.create({
      data: {
        id: "arc-course",
        code: "ARC 200",
        title: "Archive practice",
        units: 3,
        level: 200,
        semester: 2,
        learningOutcomes: ["Restore records"],
        prerequisites: { connect: [{ id: "arc-pre" }] },
      },
    });

    const needed = await remove(deleteMasterCourse, "/api/master-courses", "arc-pre", "DELETE");
    expect(needed.status).toBe(409);
    expect((await needed.json()).reasons).toEqual([
      "It is a prerequisite of 1 other Registry course.",
    ]);

    const check = await remove(deleteMasterCourse, "/api/master-courses", "arc-course");
    expect(await check.json()).toMatchObject({ confirmText: "DELETE" });
    expect(
      (await remove(deleteMasterCourse, "/api/master-courses", "arc-course", "delete")).status,
    ).toBe(200);
    expect(await prisma.masterCourse.count({ where: { id: "arc-course" } })).toBe(0);

    expect((await restore((await archived("arc-course")).id)).status).toBe(200);
    expect(
      await prisma.masterCourse.findUniqueOrThrow({
        where: { id: "arc-course" },
        select: { title: true, learningOutcomes: true, prerequisites: { select: { id: true } } },
      }),
    ).toEqual({
      title: "Archive practice",
      learningOutcomes: ["Restore records"],
      prerequisites: [{ id: "arc-pre" }],
    });
  });

  it("lets a department archive its own staff, and only administrators restore them", async () => {
    await prisma.staff.create({
      data: { ...staffFields, id: "arc-staff", departmentId: ids.departmentA },
    });
    await prisma.staff.create({
      data: { ...staffFields, id: "arc-staff-b", departmentId: ids.departmentB },
    });

    authState.userId = ids.hod;
    // Another department's staff are out of reach.
    expect((await remove(deleteStaff, "/api/staff", "arc-staff-b", "DELETE")).status).toBe(403);
    expect(await prisma.staff.count({ where: { id: "arc-staff-b" } })).toBe(1);

    const check = await remove(deleteStaff, "/api/staff", "arc-staff");
    expect(await check.json()).toMatchObject({
      code: "CONFIRMATION_REQUIRED",
      confirmText: "DELETE",
    });
    expect((await remove(deleteStaff, "/api/staff", "arc-staff", "DELETE")).status).toBe(200);
    expect(await prisma.staff.count({ where: { id: "arc-staff" } })).toBe(0);

    const record = await archived("arc-staff");
    expect((await restore(record.id)).status).toBe(403);
    authState.userId = ids.admin;
    expect((await restore(record.id)).status).toBe(200);
    expect(await prisma.staff.findUniqueOrThrow({ where: { id: "arc-staff" } })).toMatchObject({
      surname: "okafor",
      departmentId: ids.departmentA,
      academicRank: "LECTURER_I",
    });
  });
});

// Photos reach only signed-in users, an upload must really be an image of
// 4MB or less before it costs an AI review, and a bulletin's dean and HOD
// photos must be ones uploaded to the app.
describe("Photos", () => {
  const staffId = "test-photo-staff";
  const cycleId = "test-photo-cycle";
  const submissionId = "test-photo-submission";
  const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });

  const upload = (path: string, file: File, fields: Record<string, string> = {}) => {
    const form = new FormData();
    form.append("image", file);
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    return new NextRequest(`http://localhost${path}`, { method: "POST", body: form });
  };
  const staffUpload = (file: File) =>
    uploadStaffPhoto(upload(`/api/staff/${staffId}/image`, file), routeParams(staffId));
  const deanUpload = (file: File) =>
    uploadSubmissionPhoto(
      upload(`/api/submissions/${submissionId}/image`, file, { role: "dean" }),
      routeParams(submissionId),
    );
  // An AI photo review is counted before it runs, so no count means no review.
  const reviewsStarted = async () =>
    (
      await prisma.apiRateLimit.aggregate({
        where: { key: { startsWith: `imageReview:${ids.hod}:` } },
        _sum: { count: true },
      })
    )._sum.count ?? 0;

  const savePhotos = (programmeInfo: object) =>
    updateSubmission(
      new NextRequest(`http://localhost/api/submissions/${submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { programmeInfo } }),
      }),
      routeParams(submissionId),
    );
  const savedPhotos = async () =>
    (await prisma.submissionContent.findUnique({ where: { submissionId } }))?.programmeInfo;

  beforeAll(async () => {
    await prisma.staff.create({
      data: {
        id: staffId,
        title: "DR",
        gender: "MALE",
        surname: "Photo",
        firstName: "Test",
        highestQualification: "PHD",
        academicRank: "LECTURER_I",
        departmentId: ids.departmentA,
      },
    });
    await prisma.reviewCycle.create({
      data: { id: cycleId, name: "Photo Cycle", createdById: ids.super },
    });
    await prisma.submission.create({
      data: {
        id: submissionId,
        title: "Photo Submission",
        programmeId: ids.programmeA,
        createdById: ids.hod,
        cycleId,
      },
    });
  });

  beforeEach(async () => {
    // With no AI key the review answers "not configured", so a photo that
    // passes the file checks stops there and never reaches storage.
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await prisma.apiRateLimit.deleteMany({});
    authState.userId = ids.hod;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves stored photos only to signed-in users", async () => {
    authState.userId = null;
    const key = ["submissions", submissionId, "dean.jpg"];
    const signedOut = await readStoredFile(
      new NextRequest(`http://localhost/api/files/${key.join("/")}`),
      { params: Promise.resolve({ key }) },
    );
    expect(signedOut.status).toBe(401);

    authState.userId = ids.hod;
    const escape = await readStoredFile(
      new NextRequest("http://localhost/api/files/x"),
      { params: Promise.resolve({ key: ["..", "secret"] }) },
    );
    expect(escape.status).toBe(404);
  });

  it("refuses a file that isn't an image before any AI review", async () => {
    const fakes = [
      new File(["just some text"], "photo.jpg", { type: "image/jpeg" }),
      new File([Buffer.from("GIF89a\x01\x00\x01\x00")], "photo.png", { type: "image/png" }),
      new File(["<svg xmlns='http://www.w3.org/2000/svg'/>"], "photo.webp", { type: "image/webp" }),
    ];
    for (const file of fakes) {
      const response = await staffUpload(file);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("This file isn't a JPG, PNG or WEBP image.");
    }

    // A JPEG's first bytes followed by junk still fails: it must decode.
    const broken = new File(
      [Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)])],
      "photo.jpg",
      { type: "image/jpeg" },
    );
    expect((await staffUpload(broken)).status).toBe(400);
    expect((await deanUpload(fakes[0])).status).toBe(400);

    expect(await reviewsStarted()).toBe(0);
    const staff = await prisma.staff.findUnique({ where: { id: staffId } });
    expect(staff?.imageUrl).toBeNull();
  });

  it("refuses a photo over 4MB", async () => {
    const oversized = new File(
      [Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(4 * 1024 * 1024)])],
      "photo.jpg",
      { type: "image/jpeg" },
    );
    const response = await staffUpload(oversized);
    expect(response.status).toBe(413);
    expect((await response.json()).error).toBe("File too large. Maximum size is 4MB.");
    expect(await reviewsStarted()).toBe(0);
  });

  it("sends a real image on to the AI review, labelled as what it really is", async () => {
    const png = await sharp({
      create: { width: 30, height: 40, channels: 3, background: "#777777" },
    })
      .png()
      .toBuffer();

    // A PNG the browser calls a JPEG is still accepted as a PNG.
    for (const file of [
      new File([new Uint8Array(png)], "photo.png", { type: "image/png" }),
      new File([new Uint8Array(png)], "photo.jpg", { type: "image/jpeg" }),
    ]) {
      const response = await staffUpload(file);
      expect(response.status).toBe(503);
      expect((await response.json()).error).toMatch(/not configured/);
    }
    expect(await reviewsStarted()).toBe(2);
  });

  it("saves only dean and HOD photos that were uploaded to the app", async () => {
    const appPhoto = `/api/files/submissions/${submissionId}/dean.jpg?v=1`;

    for (const outside of [
      "https://example.com/dean.jpg",
      "http://169.254.169.254/latest/meta-data/",
      "/api/files/../../secret",
      "data:image/png;base64,AAAA",
    ]) {
      const refused = await savePhotos({ deanImageUrl: outside });
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ code: "PHOTO_NOT_UPLOADED" });
    }
    expect(await savedPhotos()).toBeUndefined();

    expect((await savePhotos({ deanImageUrl: appPhoto, hodImageUrl: "" })).status).toBe(200);
    expect(await savedPhotos()).toMatchObject({ deanImageUrl: appPhoto });

    // An older record keeps an address it already had, so it can still be
    // saved, but that address can't be swapped for another outside one.
    const older = "https://old-storage.example/object/public/hod.jpg";
    await prisma.submissionContent.update({
      where: { submissionId },
      data: { programmeInfo: { deanImageUrl: appPhoto, hodImageUrl: older } },
    });
    expect((await savePhotos({ deanImageUrl: appPhoto, hodImageUrl: older })).status).toBe(200);
    const swapped = await savePhotos({
      deanImageUrl: appPhoto,
      hodImageUrl: "https://example.com/other.jpg",
    });
    expect(swapped.status).toBe(400);
    expect((await swapped.json()).error).toBe(
      "The HOD's photo has to be uploaded here. Upload it again, then save.",
    );
    expect(await savedPhotos()).toMatchObject({ hodImageUrl: older });
  });
});

// Staff sign in with their babcock.edu.ng account. A personal Google account
// gets in only during a Super Admin's logged, time-boxed exception, and can
// never hold an admin role.
describe("University sign-in and exceptions", () => {
  const hd = "babcock.edu.ng";
  const personalId = "test-personal-hod";
  const personalEmail = "personal.hod@gmail.com";
  const legacyAdminId = "test-personal-super";
  const legacyAdminEmail = "personal.super@gmail.com";
  const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });
  const daysFromNow = (days: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
      new Date(Date.now() + days * 86_400_000),
    );
  const grant = (id: string, body: object) =>
    putSignInException(
      new NextRequest(`http://localhost/api/users/${id}/sign-in-exception`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      routeParams(id),
    );
  const end = (id: string) =>
    deleteSignInException(
      new NextRequest(`http://localhost/api/users/${id}/sign-in-exception`, { method: "DELETE" }),
      routeParams(id),
    );
  const actions = async (entityId: string) =>
    (
      await prisma.activityLog.findMany({
        where: { entityId, action: { startsWith: "SIGN_IN" } },
        orderBy: { createdAt: "asc" },
      })
    ).map((entry) => entry.action);

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: personalId,
          email: personalEmail,
          firstName: "Personal",
          lastName: "Hod",
          role: "HOD",
          schoolId: ids.schoolA,
          departmentId: ids.departmentA,
        },
        // A personal Super Admin from before sign-in was limited.
        {
          id: legacyAdminId,
          email: legacyAdminEmail,
          firstName: "Personal",
          lastName: "Super",
          role: "SUPER_ADMIN",
          signInExceptionUntil: new Date(Date.now() + 86_400_000),
        },
      ],
    });
  });

  it("admits a university address only when Google says it is a university account", async () => {
    const hod = await prisma.user.findUniqueOrThrow({ where: { id: ids.hod } });
    expect(await allowGoogleSignIn({ email: hod.email, email_verified: true, hd })).toBe(true);
    expect(await allowGoogleSignIn({ email: hod.email, email_verified: true })).toBe(
      "/login?error=personal_account",
    );
  });

  it("lets a personal account in only during its exception, and logs each sign-in", async () => {
    const google = { email: personalEmail, email_verified: true };
    expect(await allowGoogleSignIn(google)).toBe("/login?error=personal_account");

    authState.userId = ids.super;
    const granted = await grant(personalId, { reason: "Awaiting a university account", until: daysFromNow(10) });
    expect(granted.status).toBe(200);
    expect(await granted.json()).toMatchObject({ signInExceptionReason: "Awaiting a university account" });

    expect(await allowGoogleSignIn(google)).toBe(true);
    const signedIn = Date.now();
    const token = await refreshSessionToken({}, google, signedIn);
    expect(token).toMatchObject({ userId: personalId });
    expect(
      await refreshSessionToken(token!, undefined, signedIn + RECHECK_MS + 1),
    ).toMatchObject({ userId: personalId });

    // Ending it signs them out at the next session re-check.
    expect((await end(personalId)).status).toBe(200);
    expect(await refreshSessionToken(token!, undefined, signedIn + RECHECK_MS + 1)).toBeNull();
    expect(await allowGoogleSignIn(google)).toBe("/login?error=personal_account");
    expect((await end(personalId)).status).toBe(409);

    // An exception that has run out also ends the session.
    await prisma.user.update({
      where: { id: personalId },
      data: { signInExceptionUntil: new Date(signedIn + 60_000) },
    });
    expect(await refreshSessionToken(token!, undefined, signedIn + RECHECK_MS + 1)).toBeNull();

    expect(await actions(personalId)).toEqual([
      "SIGN_IN_EXCEPTION_GRANTED",
      "SIGN_IN_VIA_EXCEPTION",
      "SIGN_IN_EXCEPTION_ENDED",
    ]);
    const grantEntry = await prisma.activityLog.findFirstOrThrow({
      where: { entityId: personalId, action: "SIGN_IN_EXCEPTION_GRANTED" },
    });
    expect(grantEntry.actorId).toBe(ids.super);
    expect(grantEntry.metadata).toMatchObject({
      email: personalEmail,
      reason: "Awaiting a university account",
    });
  });

  it("never lets a personal account act as an admin, exception or not", async () => {
    const google = { email: legacyAdminEmail, email_verified: true };
    expect(await allowGoogleSignIn(google)).toBe("/login?error=personal_account_admin");

    // A session from before the change ends at its next re-check.
    const start = Date.now();
    const token = { userId: legacyAdminId, checkedAt: start };
    expect(await refreshSessionToken(token, undefined, start + RECHECK_MS + 1)).toBeNull();
  });

  it("lets only a Super Admin grant an exception, for a personal non-admin account, up to 90 days", async () => {
    const body = { reason: "Visiting examiner", until: daysFromNow(30) };

    authState.userId = ids.admin;
    expect((await grant(personalId, body)).status).toBe(403);
    expect((await end(personalId)).status).toBe(403);

    authState.userId = ids.super;
    expect((await grant(ids.hod, body)).status).toBe(400);
    expect((await grant(legacyAdminId, body)).status).toBe(400);
    expect((await grant(personalId, { ...body, reason: "  " })).status).toBe(400);
    expect((await grant(personalId, { ...body, until: daysFromNow(-1) })).status).toBe(400);
    const tooLong = await grant(personalId, { ...body, until: daysFromNow(91) });
    expect(tooLong.status).toBe(400);
    expect((await tooLong.json()).error).toMatch(/at most 90 days/);
    expect((await grant(personalId, { ...body, until: daysFromNow(90) })).status).toBe(200);

    const saved = await prisma.user.findUniqueOrThrow({ where: { id: personalId } });
    expect(saved.signInExceptionGrantedById).toBe(ids.super);
    expect(saved.signInExceptionUntil!.getTime()).toBeGreaterThan(Date.now() + 89 * 86_400_000);
  });

  it("keeps admin roles off personal accounts when adding or changing users", async () => {
    authState.userId = ids.super;
    const form = new FormData();
    form.set("firstName", "Gmail");
    form.set("lastName", "Admin");
    form.set("email", "gmail.admin@gmail.com");
    form.set("role", "ADMIN");
    expect(await adminCreateUser(null, form)).toEqual({
      error:
        "Academic Planning Admin and Super Administrator accounts must use a babcock.edu.ng email address.",
    });
    expect(await prisma.user.count({ where: { email: "gmail.admin@gmail.com" } })).toBe(0);

    for (const role of ["ADMIN", "SUPER_ADMIN"]) {
      const refused = await updateUser(
        new NextRequest(`http://localhost/api/users/${personalId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        }),
        routeParams(personalId),
      );
      expect(refused.status).toBe(403);
      expect((await refused.json()).error).toMatch(/must use a babcock\.edu\.ng email address/);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: personalId } })).role).toBe("HOD");
    expect(
      await prisma.activityLog.count({
        where: { entityId: personalId, action: "USER_UPDATE_REFUSED" },
      }),
    ).toBe(2);
  });

  it("gives existing personal accounts outside the admin roles 30 days at rollout, once", async () => {
    const migration = readFileSync(
      join(process.cwd(), "prisma/migrations/20261119090000_add_sign_in_exceptions/migration.sql"),
      "utf8",
    );
    const run = async () => {
      const client = new PgClient({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      try {
        await client.query(migration);
      } finally {
        await client.end();
      }
    };
    await prisma.user.createMany({
      data: [
        { id: "rollout-dean", email: "rollout.dean@yahoo.com", firstName: "Rollout", lastName: "Dean", role: "DEAN", schoolId: ids.schoolA },
        { id: "rollout-inactive", email: "rollout.inactive@gmail.com", firstName: "Rollout", lastName: "Inactive", role: "HOD", isActive: false, departmentId: ids.departmentA },
        { id: "rollout-admin", email: "rollout.admin@gmail.com", firstName: "Rollout", lastName: "Admin", role: "ADMIN" },
      ],
    });
    const universityBefore = await prisma.user.findUniqueOrThrow({ where: { id: ids.hod } });
    const personalBefore = await prisma.user.findUniqueOrThrow({ where: { id: personalId } });

    await run();
    await run();

    const dean = await prisma.user.findUniqueOrThrow({ where: { id: "rollout-dean" } });
    const days = (dean.signInExceptionUntil!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect(dean.signInExceptionReason).toBe(
      "Existing account when sign-in was limited to babcock.edu.ng accounts",
    );
    expect(await actions("rollout-dean")).toEqual(["SIGN_IN_EXCEPTION_GRANTED"]);
    const logged = await prisma.activityLog.findFirstOrThrow({ where: { entityId: "rollout-dean" } });
    expect(Math.abs(logged.createdAt.getTime() - Date.now())).toBeLessThan(60_000);

    // Not inactive accounts, admins, university accounts, or anyone who
    // already has an exception.
    for (const id of ["rollout-inactive", "rollout-admin"]) {
      expect((await prisma.user.findUniqueOrThrow({ where: { id } })).signInExceptionUntil).toBeNull();
      expect(await actions(id)).toEqual([]);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.hod } })).signInExceptionUntil).toEqual(
      universityBefore.signInExceptionUntil,
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: personalId } })).signInExceptionUntil).toEqual(
      personalBefore.signInExceptionUntil,
    );
  });
});

// Academic Planning Admins and Super Admins enter an authenticator code at
// every sign-in. Time is fixed here so codes are predictable.
describe("Two-step verification for admins", () => {
  const adminId = "mfa-admin";
  const adminEmail = "mfa-admin@babcock.edu.ng";
  const start = new Date("2026-11-19T10:00:05.000Z");
  const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });
  const call = (handler: (request: NextRequest) => Promise<Response>, path: string, body?: object) =>
    handler(
      new NextRequest(`http://localhost${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      }),
    );
  const setup = () => startTwoStepSetup();
  const confirm = (code: string) => call(confirmTwoStepSetup, "/api/mfa/setup/confirm", { code });
  const verify = (code: string) => call(verifyTwoStepCode, "/api/mfa/verify", { code });
  const renew = (code: string) => call(renewRecoveryCodes, "/api/mfa/recovery-codes", { code });
  const reset = (id: string, confirmText?: string) =>
    resetTwoStep(
      new NextRequest(`http://localhost/api/users/${id}/mfa`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        ...(confirmText !== undefined && { body: JSON.stringify({ confirm: confirmText }) }),
      }),
      routeParams(id),
    );
  /** Signs in as the test admin: a new sign-in id, still waiting for a code. */
  const signIn = (sessionId: string, mfa: "pending" | "verified" = "pending") => {
    authState.userId = adminId;
    authState.sessionId = sessionId;
    authState.mfa = mfa;
  };
  const at = (seconds: number) => vi.setSystemTime(new Date(start.getTime() + seconds * 1000));
  const codeFor = (secret: string, offsetSteps = 0) =>
    totpCode(base32Decode(secret), totpStep(Date.now()) + offsetSteps);
  const logged = (action: string) =>
    prisma.activityLog.count({ where: { entityId: adminId, action } });
  const storedSecret = async () =>
    (
      await prisma.user.findUniqueOrThrow({
        where: { id: adminId },
        select: { mfaSecret: true, mfaEnabledAt: true, mfaLastUsedStep: true },
      })
    );

  let secret = "";
  let recoveryCodes: string[] = [];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: start });
    await prisma.user.create({
      data: { id: adminId, email: adminEmail, firstName: "Mfa", lastName: "Admin", role: "ADMIN" },
    });
  });

  beforeEach(async () => {
    await prisma.apiRateLimit.deleteMany({});
    vi.mocked(after).mockClear();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("starts every admin sign-in waiting for a code, and keeps admin APIs shut until then", async () => {
    const hod = await prisma.user.findUniqueOrThrow({ where: { id: ids.hod } });
    const adminToken = await refreshSessionToken({}, { email: adminEmail }, Date.now());
    expect(adminToken).toMatchObject({ userId: adminId, mfa: "pending" });
    expect(adminToken!.sid).toMatch(/^[0-9a-f-]{36}$/);
    const again = await refreshSessionToken({}, { email: adminEmail }, Date.now());
    expect(again!.sid).not.toBe(adminToken!.sid);
    expect(await refreshSessionToken({}, { email: hod.email }, Date.now())).toMatchObject({
      userId: ids.hod,
      mfa: "none",
    });

    // Pending, or "verified" in the cookie with nothing on record: refused.
    for (const mfa of ["pending", "verified"] as const) {
      signIn("mfa-unchecked", mfa);
      expect(await getApiUser()).toBeNull();
      const gate = await requireApiUser(["ADMIN"]);
      expect(gate.ok).toBe(false);
      if (!gate.ok) {
        expect(gate.response.status).toBe(401);
        expect(await gate.response.json()).toMatchObject({ code: "MFA_REQUIRED" });
      }
      const me = await getCurrentUser();
      expect(me.status).toBe(401);
      expect(await me.json()).toMatchObject({ code: "MFA_REQUIRED" });
      expect((await listFullUsers()).status).toBe(401);
    }

    // Other roles don't use it.
    authState.userId = ids.hod;
    authState.sessionId = null;
    authState.mfa = "none";
    expect((await getApiUser())?.id).toBe(ids.hod);
    expect((await setup()).status).toBe(400);
  });

  it("sets up the app with a QR code and the first code, and gives ten recovery codes once", async () => {
    signIn("mfa-sign-in-1");
    expect(await verify("123456")).toMatchObject({ status: 409 });

    const savedKey = process.env.MFA_ENCRYPTION_KEY;
    delete process.env.MFA_ENCRYPTION_KEY;
    try {
      const unavailable = await setup();
      expect(unavailable.status).toBe(503);
      expect(await unavailable.json()).toMatchObject({ code: "MFA_NOT_CONFIGURED" });
    } finally {
      process.env.MFA_ENCRYPTION_KEY = savedKey;
    }

    const first = await (await setup()).json();
    expect(first.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(first.account).toBe(adminEmail);
    const firstSecret = first.secret.replace(/ /g, "");

    // Each start makes a new secret; the earlier one stops working.
    const second = await setup();
    expect(second.status).toBe(200);
    secret = (await second.json()).secret.replace(/ /g, "");
    expect(secret).not.toBe(firstSecret);
    const stored = await storedSecret();
    expect(stored.mfaSecret).toMatch(/^v1\./);
    expect(stored.mfaSecret).not.toContain(secret);
    expect(stored.mfaEnabledAt).toBeNull();

    expect((await confirm("12345")).status).toBe(400);
    const stale = await confirm(codeFor(firstSecret));
    expect(stale.status).toBe(400);
    expect(await stale.json()).toMatchObject({ code: "WRONG_CODE" });

    const confirmed = await confirm(codeFor(secret));
    expect(confirmed.status).toBe(200);
    recoveryCodes = (await confirmed.json()).recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    for (const code of recoveryCodes) expect(code).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);

    const rows = await prisma.mfaRecoveryCode.findMany({ where: { userId: adminId } });
    expect(rows).toHaveLength(10);
    for (const row of rows) expect(recoveryCodes).not.toContain(row.codeHash);
    expect((await storedSecret()).mfaEnabledAt).toEqual(start);
    expect(
      await prisma.mfaVerification.findUnique({ where: { sessionId: "mfa-sign-in-1" } }),
    ).toMatchObject({ userId: adminId, method: "AUTHENTICATOR" });
    expect(await logged("MFA_ENABLED")).toBe(1);
    expect(vi.mocked(after)).toHaveBeenCalled();

    // Until the session cookie catches up, the sign-in still reads as
    // pending; once it does, this sign-in counts as checked.
    expect(await getApiUser()).toBeNull();
    signIn("mfa-sign-in-1", "verified");
    expect((await getApiUser())?.id).toBe(adminId);
    // And the set-up can't start again.
    expect((await setup()).status).toBe(409);
    expect(await (await readTwoStepStatus()).json()).toMatchObject({ recoveryCodesLeft: 10 });

    // The encrypted secret never leaves the database in a user record.
    expect(await prisma.user.findUnique({ where: { id: adminId } })).not.toHaveProperty("mfaSecret");
    authState.userId = ids.super;
    authState.sessionId = undefined;
    authState.mfa = "verified";
    const users = await (await listFullUsers()).json();
    const listed = users.find((user: { id: string }) => user.id === adminId);
    expect(listed.mfaEnabledAt).not.toBeNull();
    expect(JSON.stringify(users)).not.toContain(stored.mfaSecret);
  });

  it("follows the database for the session state, for 12 hours at most", async () => {
    const pending = { userId: adminId, sid: "mfa-sign-in-1", mfa: "pending" as const, checkedAt: Date.now() };
    expect(await refreshSessionToken(pending, undefined, Date.now())).toMatchObject({
      mfa: "verified",
      mfaVerifiedAt: start.getTime(),
    });
    expect(
      await refreshSessionToken({ ...pending, sid: "mfa-someone-else" }, undefined, Date.now()),
    ).toMatchObject({ mfa: "pending" });
    expect(
      await refreshSessionToken(pending, undefined, start.getTime() + MFA_SESSION_MS + 1),
    ).toMatchObject({ mfa: "pending" });

    // An admin session from before two-step verification signs in again.
    expect(
      await refreshSessionToken({ userId: adminId, checkedAt: Date.now() }, undefined, Date.now()),
    ).toBeNull();
    expect(
      await refreshSessionToken({ userId: ids.hod, checkedAt: Date.now() }, undefined, Date.now()),
    ).toMatchObject({ mfa: "none" });

    signIn("mfa-sign-in-1", "verified");
    at(MFA_SESSION_MS / 1000 + 1);
    try {
      expect(await getApiUser()).toBeNull();
    } finally {
      at(0);
    }
  });

  it("accepts each code once, refuses wrong ones, and limits tries", async () => {
    signIn("mfa-sign-in-2");
    // The set-up used this 30-second code already.
    const reused = await verify(codeFor(secret));
    expect(reused.status).toBe(400);
    expect(await reused.json()).toMatchObject({ code: "CODE_ALREADY_USED" });

    at(30);
    const valid = new Set([-1, 0, 1].map((offset) => codeFor(secret, offset)));
    const wrong = ["000000", "111111", "222222"].find((code) => !valid.has(code))!;
    expect(await (await verify(wrong)).json()).toMatchObject({ code: "WRONG_CODE" });

    const ok = await verify(` ${codeFor(secret).slice(0, 3)} ${codeFor(secret).slice(3)} `);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ method: "AUTHENTICATOR" });
    expect(await logged("MFA_VERIFIED")).toBe(1);
    expect((await storedSecret()).mfaLastUsedStep).toBe(totpStep(Date.now()));

    signIn("mfa-sign-in-3");
    expect(await (await verify(codeFor(secret))).json()).toMatchObject({ code: "CODE_ALREADY_USED" });

    // Two sign-ins racing with the same new code: only one gets in.
    await prisma.apiRateLimit.deleteMany({});
    at(45);
    const racing = codeFor(secret, 1);
    const [first, second] = await Promise.all(
      ["mfa-race-1", "mfa-race-2"].map(async (sessionId) => {
        signIn(sessionId);
        return verify(racing);
      }),
    );
    expect([first.status, second.status].sort()).toEqual([200, 400]);
    expect(
      await prisma.mfaVerification.count({ where: { sessionId: { in: ["mfa-race-1", "mfa-race-2"] } } }),
    ).toBe(1);

    // Five tries per five minutes; the first refusal is logged and emailed.
    signIn("mfa-sign-in-3");
    await prisma.apiRateLimit.deleteMany({});
    vi.mocked(after).mockClear();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await verify(wrong)).status).toBe(400);
    }
    const limited = await verify(codeFor(secret, 1));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "RATE_LIMITED" });
    expect((await verify(codeFor(secret, 1))).status).toBe(429);
    expect(await logged("MFA_LOCKED")).toBe(1);
    expect(vi.mocked(after)).toHaveBeenCalledTimes(1);
    expect(await prisma.mfaVerification.findUnique({ where: { sessionId: "mfa-sign-in-3" } })).toBeNull();
  });

  it("lets a recovery code in once, and new codes replace the old ones", async () => {
    signIn("mfa-sign-in-4");
    const used = await verify(recoveryCodes[0].toLowerCase().replace("-", " "));
    expect(used.status).toBe(200);
    expect(await used.json()).toMatchObject({ method: "RECOVERY_CODE", recoveryCodesLeft: 9 });
    expect(
      await prisma.mfaVerification.findUnique({ where: { sessionId: "mfa-sign-in-4" } }),
    ).toMatchObject({ method: "RECOVERY_CODE" });
    expect(await logged("MFA_RECOVERY_CODE_USED")).toBe(1);

    signIn("mfa-sign-in-5");
    expect(await (await verify(recoveryCodes[0])).json()).toMatchObject({ code: "WRONG_CODE" });

    // Making new codes needs a checked sign-in and a current app code.
    expect(await (await renew(codeFor(secret, 1))).json()).toMatchObject({ code: "MFA_REQUIRED" });
    signIn("mfa-sign-in-4", "verified");
    expect((await renew("12")).status).toBe(400);
    at(90);
    const renewed = await renew(codeFor(secret));
    expect(renewed.status).toBe(200);
    const fresh: string[] = (await renewed.json()).recoveryCodes;
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toContain(recoveryCodes[1]);
    expect(await logged("MFA_RECOVERY_CODES_RENEWED")).toBe(1);
    expect(await (await readTwoStepStatus()).json()).toMatchObject({ recoveryCodesLeft: 10 });

    signIn("mfa-sign-in-6");
    expect((await verify(recoveryCodes[1])).status).toBe(400);
    expect((await verify(fresh[0])).status).toBe(200);
  });

  it("lets another Super Admin reset it, with the email typed, ending admin access at once", async () => {
    authState.userId = ids.super;
    authState.sessionId = undefined;
    authState.mfa = "verified";
    const own = await reset(ids.super, `${ids.super}@babcock.edu.ng`);
    expect(own.status).toBe(403);
    expect(await own.json()).toMatchObject({ code: "OWN_ACCOUNT" });

    authState.userId = ids.admin;
    expect((await reset(adminId, adminEmail)).status).toBe(403);

    authState.userId = ids.super;
    expect(await (await reset(adminId)).json()).toMatchObject({ code: "CONFIRMATION_REQUIRED" });
    expect((await reset(adminId, "someone@babcock.edu.ng")).status).toBe(400);
    expect(await storedSecret()).toMatchObject({ mfaEnabledAt: start });

    const done = await reset(adminId, `  ${adminEmail.toUpperCase()} `);
    expect(done.status).toBe(200);
    expect((await done.json()).endedSessions).toBeGreaterThanOrEqual(4);
    expect(await storedSecret()).toEqual({ mfaSecret: null, mfaEnabledAt: null, mfaLastUsedStep: null });
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: adminId } })).toBe(0);
    expect(await prisma.mfaVerification.count({ where: { userId: adminId } })).toBe(0);
    expect(
      await prisma.activityLog.count({ where: { entityId: adminId, action: "MFA_RESET", actorId: ids.super } }),
    ).toBe(1);
    expect(vi.mocked(after)).toHaveBeenCalled();
    expect((await reset(adminId, adminEmail)).status).toBe(409);

    // Their checked sign-in no longer counts; they set the app up again.
    signIn("mfa-sign-in-4", "verified");
    expect(await getApiUser()).toBeNull();
    expect(
      await refreshSessionToken(
        { userId: adminId, sid: "mfa-sign-in-4", mfa: "verified", mfaVerifiedAt: Date.now(), checkedAt: 0 },
        undefined,
        Date.now(),
      ),
    ).toMatchObject({ mfa: "pending" });
    expect((await setup()).status).toBe(200);
  });

  it("adds its columns and tables with a migration that can run twice", async () => {
    const migration = readFileSync(
      join(process.cwd(), "prisma/migrations/20261119150000_add_two_step_verification/migration.sql"),
      "utf8",
    );
    const client = new PgClient({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(migration);
      await client.query(migration);
      const columns = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'users' AND column_name LIKE 'mfa%' ORDER BY column_name`,
      );
      expect(columns.rows.map((row) => row.column_name)).toEqual([
        "mfaEnabledAt",
        "mfaLastUsedStep",
        "mfaSecret",
      ]);
      const tables = await client.query(
        `SELECT to_regclass('mfa_recovery_codes') AS codes, to_regclass('mfa_verifications') AS checks`,
      );
      expect(tables.rows[0]).toEqual({ codes: "mfa_recovery_codes", checks: "mfa_verifications" });
    } finally {
      await client.end();
    }
  });
});

// The brief's proof of Priority 1: on a fresh draft (the same empty baseline
// as the 43 untouched drafts), reproduce each defect class found in the
// Nursing Science, Law and Economics test records and show it is refused
// before the bulletin can advance; then take the clean draft through every
// phase with the database's ledger guards switched on.
describe("Priority 1 proof on a fresh draft", () => {
  const cycleId = "proof-cycle";
  const draftId = "proof-draft";
  const outsideId = "proof-outside-draft";
  const guardMigration = join(
    process.cwd(),
    "prisma/migrations/20261105140100_ledger_guards/migration.sql",
  );
  const sql = async (text: string) => {
    const client = new PgClient({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(text);
    } finally {
      await client.end();
    }
  };
  const removeGuards = () =>
    sql(`
      DROP TRIGGER IF EXISTS phase_transitions_append_only ON "phase_transitions";
      DROP TRIGGER IF EXISTS submissions_state_requires_ledger ON "submissions";
      DROP FUNCTION IF EXISTS phase_transitions_append_only();
      DROP FUNCTION IF EXISTS submissions_state_requires_ledger();
      DROP FUNCTION IF EXISTS ledger_maintenance_enabled();
    `);

  const act = (userId: string, action: string, extra: object = {}, id = draftId) => {
    authState.userId = userId;
    return transitionSubmission(
      new NextRequest(`http://localhost/api/submissions/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...overrideFor(userId), ...extra }),
      }),
      { params: Promise.resolve({ id }) },
    );
  };
  const save = (userId: string, content: object) => {
    authState.userId = userId;
    return updateSubmission(
      new NextRequest(`http://localhost/api/submissions/${draftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
      { params: Promise.resolve({ id: draftId }) },
    );
  };
  const open = (userId: string, id = draftId) => {
    authState.userId = userId;
    return getSubmission(new NextRequest(`http://localhost/api/submissions/${id}`), {
      params: Promise.resolve({ id }),
    });
  };
  const submitAsDepartment = async () => {
    const response = await act(ids.hod, "SUBMIT");
    const body = await response.json();
    return {
      status: response.status,
      code: body.code as string | undefined,
      reasons: ((body.readiness ?? []) as { code: string; message: string }[]),
      blockers: body.blockers,
    };
  };
  const state = () =>
    prisma.submission.findUniqueOrThrow({
      where: { id: draftId },
      select: { currentPhase: true, status: true },
    });
  const ledgerRows = () => prisma.phaseTransition.count({ where: { submissionId: draftId } });

  beforeAll(async () => {
    await removeGuards();
    await prisma.reviewCycle.create({
      data: { id: cycleId, name: "Priority 1 proof", createdById: ids.super },
    });
    await prisma.submission.createMany({
      data: [
        { id: draftId, title: "Proof Draft", programmeId: ids.programmeA, createdById: ids.hod, cycleId },
        { id: outsideId, title: "Other School Draft", programmeId: ids.programmeB, createdById: ids.super, cycleId },
      ],
    });
    // The real database guards: the ledger is append-only, and a bulletin's
    // phase changes only together with its ledger row.
    await sql(readFileSync(guardMigration, "utf8"));
  });

  afterAll(async () => {
    await removeGuards();
    await prisma.activityLog.deleteMany({ where: { entityId: { in: [draftId, outsideId] } } });
    await prisma.staff.deleteMany({ where: { id: "proof-staff-other" } });
    await prisma.submission.deleteMany({ where: { id: { in: [draftId, outsideId] } } });
    await prisma.reviewCycle.deleteMany({ where: { id: cycleId } });
  });

  it("refuses a blank draft and names every empty required field", async () => {
    const blank = await submitAsDepartment();
    expect(blank.status).toBe(409);
    expect(blank.code).toBe("SUBMISSION_INCOMPLETE");
    expect(blank.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "NO_COURSES",
        "MISSING_PHILOSOPHY",
        "MISSING_MINIMUM_DURATION",
        "MISSING_MINIMUM_CGPA",
        "MISSING_TOTAL_UNITS",
      ]),
    );
    expect(await state()).toEqual({ currentPhase: 1, status: "DRAFT" });
    expect(await ledgerRows()).toBe(0);
  });

  it("refuses each defect from the test records at Submit, with its reason", async () => {
    await prepareDraftForSubmit(draftId);
    const course = await prisma.course.findFirstOrThrow({
      where: { submissionId: draftId },
      include: { description: true },
    });
    const refusedFor = async (code: string, detail?: string) => {
      const result = await submitAsDepartment();
      expect(result.status, code).toBe(409);
      const reason = result.reasons.find((item) => item.code === code);
      expect(reason, code).toBeDefined();
      if (detail) expect(reason?.message).toContain(detail);
    };

    // Nursing Science: 203 declared units against the course structure.
    await prisma.submissionContent.update({ where: { submissionId: draftId }, data: { totalUnits: 203 } });
    await refusedFor("UNIT_TOTAL_MISMATCH", "203");
    await prisma.submissionContent.update({ where: { submissionId: draftId }, data: { totalUnits: course.units } });

    // A CGPA outside the 5-point scale.
    await prisma.submissionContent.update({ where: { submissionId: draftId }, data: { minimumCGPA: 7.5 } });
    await refusedFor("CGPA_OUT_OF_RANGE", "7.5");
    await prisma.submissionContent.update({ where: { submissionId: draftId }, data: { minimumCGPA: 2.5 } });

    // Law: staff with rank OTHER and no job title.
    await prisma.staff.create({
      data: {
        id: "proof-staff-other",
        title: "DR",
        gender: "MALE",
        surname: "Nameless",
        firstName: "Rank",
        highestQualification: "PHD",
        academicRank: "OTHER",
        departmentId: ids.departmentA,
      },
    });
    await refusedFor("STAFF_RANK_MISSING", "Nameless");
    await prisma.staff.delete({ where: { id: "proof-staff-other" } });

    // A philosophy written for another programme.
    const wrongPhilosophy = [
      "This philosophy belongs to Test Programme B and the graduates it forms.",
      ...Array.from({ length: 150 }, (_, index) => `idea${index + 1}`),
    ].join(" ");
    const { philosophy, philosophyGrace } = await prisma.submissionContent.findUniqueOrThrow({
      where: { submissionId: draftId },
    });
    await prisma.submissionContent.update({
      where: { submissionId: draftId },
      data: { philosophy: wrongPhilosophy },
    });
    await refusedFor("PHILOSOPHY_OTHER_PROGRAMME", "Test Programme B");
    await prisma.submissionContent.update({
      where: { submissionId: draftId },
      data: { philosophy, philosophyGrace: philosophyGrace ?? undefined },
    });

    // Economics: course descriptions that failed GRACE.
    await prisma.courseDescription.update({
      where: { courseId: course.id },
      data: { graceStatus: "NEEDS_REVISION", gracePass: false },
    });
    const failing = await submitAsDepartment();
    expect(failing).toMatchObject({
      status: 409,
      code: "GRACE_COMPLIANCE_REQUIRED",
      blockers: { needsRevision: [course.code] },
    });
    await prisma.courseDescription.update({
      where: { courseId: course.id },
      data: { graceStatus: "COMPLIANT", gracePass: true },
    });

    // A course description changed after its GRACE pass (a stale check).
    await prisma.courseDescription.update({
      where: { courseId: course.id },
      data: { courseContent: `${course.description!.courseContent} edited` },
    });
    expect(await submitAsDepartment()).toMatchObject({
      status: 409,
      blockers: { changed: [course.code] },
    });
    await prisma.courseDescription.update({
      where: { courseId: course.id },
      data: { courseContent: course.description!.courseContent },
    });

    // Script stored in the Regulations is refused on save (security test 4).
    const unsafe = await save(ids.hod, {
      sectionF: { content: '<p>Rules</p><img src=x onerror="alert(1)">' },
    });
    expect(unsafe.status).toBe(400);
    expect(await unsafe.json()).toMatchObject({ code: "UNSAFE_MARKUP" });
    expect(
      (await prisma.submissionContent.findUniqueOrThrow({ where: { submissionId: draftId } }))
        .sectionF,
    ).toBeNull();
    expect(
      (await save(ids.hod, { sectionF: { content: "<p>Students <strong>must</strong> attend.</p>" } }))
        .status,
    ).toBe(200);

    // None of this moved the draft or wrote to the ledger.
    expect(await state()).toEqual({ currentPhase: 1, status: "DRAFT" });
    expect(await ledgerRows()).toBe(0);
  });

  it("lets the clean draft through, and only the right caller in the right school act", async () => {
    // Opening a bulletin never runs or queues a GRACE check.
    const checksBefore = await prisma.graceAssessment.count();
    expect((await open(ids.admin)).status).toBe(200);
    expect(await prisma.graceAssessment.count()).toBe(checksBefore);

    const submitted = await act(ids.hod, "SUBMIT");
    expect(submitted.status).toBe(200);
    expect(await state()).toEqual({ currentPhase: 2, status: "IN_REVIEW" });

    // Wrong school: another school's bulletin can't be read or moved.
    expect((await open(ids.hod, outsideId)).status).toBe(403);
    expect((await open(ids.dean, outsideId)).status).toBe(403);
    expect((await act(ids.hod, "SUBMIT", {}, outsideId)).status).toBe(403);
    // Wrong role and wrong phase: only the Dean reviews Phase 2.
    expect((await act(ids.hod, "APPROVE")).status).toBe(403);
    expect((await act(ids.coordinator, "APPROVE")).status).toBe(403);
    expect((await act(ids.admin, "APPROVE")).status).toBe(403);
    expect(await state()).toEqual({ currentPhase: 2, status: "IN_REVIEW" });
  });

  it("takes it through every phase with no one clearing two gates in a row", async () => {
    const course = await prisma.course.findFirstOrThrow({ where: { submissionId: draftId } });

    expect((await act(ids.dean, "APPROVE")).status).toBe(200); // 2 -> 3
    expect((await act(ids.admin, "APPROVE")).status).toBe(200); // 3 -> 4

    // The audit's "one actor cleared five phases": refused at the second gate.
    const again = await act(ids.admin, "APPROVE");
    expect(again.status).toBe(403);
    expect(await again.json()).toMatchObject({ code: "SEPARATION_OF_DUTIES" });

    // Item 2: a failing GRACE result stops every approval, not only Submit.
    await prisma.courseDescription.update({
      where: { courseId: course.id },
      data: { graceStatus: "NEEDS_REVISION", gracePass: false },
    });
    const gated = await act(ids.super, "APPROVE");
    expect(gated.status).toBe(409);
    expect(await gated.json()).toMatchObject({ code: "GRACE_APPROVAL_BLOCKED" });
    await prisma.courseDescription.update({
      where: { courseId: course.id },
      data: { graceStatus: "COMPLIANT", gracePass: true },
    });

    expect((await act(ids.super, "APPROVE")).status).toBe(200); // 4 -> 5
    expect((await act(ids.admin, "APPROVE")).status).toBe(200); // 5 -> 6

    // Senate (Phase 6) closes only with its minute reference.
    const noMinute = await act(ids.super, "APPROVE");
    expect(noMinute.status).toBe(400);
    expect(await noMinute.json()).toMatchObject({ code: "EVIDENCE_REQUIRED" });
    expect((await act(ids.super, "APPROVE", { reference: "SEN/2026/11/07" })).status).toBe(200); // 6 -> 7

    expect((await act(ids.admin, "APPROVE")).status).toBe(200); // 7 -> 8
    expect((await act(ids.super, "APPROVE")).status).toBe(200); // 8 -> 9
    expect((await act(ids.admin, "APPROVE")).status).toBe(200); // 9 -> 10
    expect(await state()).toEqual({ currentPhase: 10, status: "APPROVED" });
  });

  it("wrote exactly one permanent ledger row per state change", async () => {
    const ledger = await prisma.phaseTransition.findMany({
      where: { submissionId: draftId },
      orderBy: { transitionedAt: "asc" },
    });
    // Submit plus eight approvals; refusals wrote nothing.
    expect(ledger.map((row) => [row.fromPhase, row.toPhase])).toEqual(
      Array.from({ length: 9 }, (_, index) => [index + 1, index + 2]),
    );
    for (const [index, row] of ledger.entries()) {
      expect(row.actorRole, `row ${index}`).not.toBeNull();
      expect(row.contentHash, `row ${index}`).toMatch(/^[0-9a-f]{64}$/);
      if (index > 0) expect(row.performedById).not.toBe(ledger[index - 1].performedById);
    }
    expect(ledger.find((row) => row.fromPhase === 6)?.reference).toBe("SEN/2026/11/07");
    expect(ledger.every((row) => row.graceOverride === null)).toBe(true);

    // No edit or delete path: the database refuses them.
    await expect(
      prisma.phaseTransition.updateMany({ where: { submissionId: draftId }, data: { remarks: "edited" } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.phaseTransition.deleteMany({ where: { submissionId: draftId } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.submission.delete({ where: { id: draftId } })).rejects.toThrow(
      /append-only/,
    );
    // And a bulletin's phase can't change without its ledger row.
    await expect(
      prisma.submission.update({ where: { id: draftId }, data: { currentPhase: 1, status: "DRAFT" } }),
    ).rejects.toThrow(/phase_transitions row/);
    expect(await ledgerRows()).toBe(9);
    expect(await state()).toEqual({ currentPhase: 10, status: "APPROVED" });
  });
});

// D4: each phase is locked to its owner on the server. Anyone else who may
// step in (a Super Administrator anywhere, an Academic Planning admin at
// School Board Harmonisation) acts only through a flagged override with a
// reason of at least 20 characters. A Head of Department never can.
describe("phase overrides (D4)", () => {
  const cycleId = "d4-cycle";
  const submissionId = "d4-submission";

  beforeAll(async () => {
    await prisma.reviewCycle.create({ data: { id: cycleId, name: "D4 overrides", createdById: ids.super } });
    await prisma.submission.create({
      data: { id: submissionId, title: "D4 Bulletin", programmeId: ids.programmeA, createdById: ids.hod, cycleId },
    });
    await prepareDraftForSubmit(submissionId);
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { id: submissionId } });
    await prisma.reviewCycle.deleteMany({ where: { id: cycleId } });
  });

  const act = (userId: string, action: string, extra: object = {}) => {
    authState.userId = userId;
    return transitionSubmission(
      new NextRequest(`http://localhost/api/submissions/${submissionId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      }),
      { params: Promise.resolve({ id: submissionId }) },
    );
  };
  const workflowFor = async (userId: string) => {
    authState.userId = userId;
    const response = await getSubmission(
      new NextRequest(`http://localhost/api/submissions/${submissionId}`),
      { params: Promise.resolve({ id: submissionId }) },
    );
    return (await response.json()).workflow;
  };

  it("asks a Super Administrator for a 20-character reason outside their own phase", async () => {
    expect((await workflowFor(ids.hod)).override).toBeNull();
    expect(await workflowFor(ids.super)).toMatchObject({ actions: ["SUBMIT"], override: { minLength: 20 } });

    const bare = await act(ids.super, "SUBMIT");
    expect(bare.status).toBe(403);
    expect(await bare.json()).toMatchObject({ code: "OVERRIDE_REASON_REQUIRED" });
    const short = await act(ids.super, "SUBMIT", { override: { reason: "Head is unavailable" } }); // 19
    expect(short.status).toBe(403);
    expect(await prisma.phaseTransition.count({ where: { submissionId } })).toBe(0);
  });

  it("lets the owner act without one, and never lets a Head of Department approve", async () => {
    expect((await act(ids.hod, "SUBMIT")).status).toBe(200);
    const row = await prisma.phaseTransition.findFirstOrThrow({ where: { submissionId, toPhase: 2 } });
    expect(row.phaseOverride).toBeNull();

    expect((await act(ids.hod, "APPROVE", { override: { reason: "I would like to approve my own work." } })).status).toBe(403);
  });

  it("flags an Academic Planning admin's override at Phase 2 on the ledger and in the log", async () => {
    expect((await workflowFor(ids.dean)).override).toBeNull();
    expect(await workflowFor(ids.admin)).toMatchObject({ override: { minLength: 20 } });
    expect((await act(ids.admin, "APPROVE")).status).toBe(403);

    const reason = "The Dean is on leave until January; approved on the Deputy Vice-Chancellor's instruction.";
    expect((await act(ids.admin, "APPROVE", { override: { reason } })).status).toBe(200);
    const row = await prisma.phaseTransition.findFirstOrThrow({ where: { submissionId, toPhase: 3 } });
    expect(row.phaseOverride).toEqual({ reason, role: "ADMIN" });
    const log = await prisma.activityLog.findFirstOrThrow({
      where: { action: "SUBMISSION_APPROVE", entityId: submissionId },
      orderBy: { createdAt: "desc" },
    });
    expect(log.description).toContain("Phase override");
    expect(log.metadata).toMatchObject({ flagged: true, phaseOverride: { reason } });

    // The programme shows it.
    authState.userId = ids.hod;
    const page = await (
      await getSubmission(new NextRequest(`http://localhost/api/submissions/${submissionId}`), {
        params: Promise.resolve({ id: submissionId }),
      })
    ).json();
    expect(page.phaseTransitions.find((t: { toPhase: number }) => t.toPhase === 3).phaseOverride).toEqual({
      reason,
      role: "ADMIN",
    });
  });
});

// G6: a course the department removes stays removed, even when the Registry
// is uploaded again; W1: the General Education block can't be changed or
// removed by a department.
describe("removed courses stay removed (G6) and General Education is locked (W1)", () => {
  const cycleId = "g6-cycle";
  const submissionId = "g6-submission";

  beforeAll(async () => {
    await prisma.reviewCycle.create({ data: { id: cycleId, name: "G6", createdById: ids.super } });
    await prisma.submission.create({
      data: { id: submissionId, title: "G6 Bulletin", programmeId: ids.programmeA, createdById: ids.hod, cycleId },
    });
    await prisma.masterCourse.createMany({
      data: [
        { id: "g6-gst", code: "GST 118", title: "Locked general course", units: 2, type: "GST_NUC", ownership: "INSTITUTIONAL", level: 100, semester: 1 },
        { id: "g6-dept", code: "GXZ 201", title: "Departmental registry course", units: 3, type: "CORE", ownership: "DEPARTMENT", level: 200, semester: 2, ownerDeptId: ids.departmentA },
      ],
    });
    await prisma.programmeCourse.create({ data: { programmeId: ids.programmeA, courseId: "g6-dept" } });
    await preloadRegistryCoursesForSubmission(submissionId);
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { id: submissionId } });
    await prisma.reviewCycle.deleteMany({ where: { id: cycleId } });
    await prisma.programmeCourse.deleteMany({ where: { courseId: { in: ["g6-gst", "g6-dept"] } } });
    await prisma.masterCourse.deleteMany({ where: { id: { in: ["g6-gst", "g6-dept"] } } });
  });

  const row = (code: string) =>
    prisma.course.findUnique({ where: { code_submissionId: { code, submissionId } } });
  const call = <T,>(handler: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<T>, id: string, method: string, body: object) => {
    authState.userId = ids.hod;
    return handler(
      new Request(`http://localhost/api/courses/${id}`, { method, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id }) },
    );
  };

  it("keeps a removed Registry course out of the draft when the Registry is preloaded again", async () => {
    const course = await row("GXZ 201");
    expect(course).not.toBeNull();
    expect(((await call(deleteCourseRow, course!.id, "DELETE", { confirm: "DELETE" })) as Response).status).toBe(200);
    expect(await row("GXZ 201")).toBeNull();
    expect(
      (await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })).dismissedRegistryCourseIds,
    ).toEqual(["g6-dept"]);

    // A later Registry upload, and reading the list, leave it out.
    await preloadRegistryCoursesForSubmission(submissionId);
    authState.userId = ids.hod;
    await listCourses(new Request(`http://localhost/api/courses?submissionId=${submissionId}`));
    expect(await row("GXZ 201")).toBeNull();

    // Adding it back on purpose clears the mark.
    authState.userId = ids.hod;
    const added = await createCourseRow(
      new Request("http://localhost/api/courses", {
        method: "POST",
        body: JSON.stringify({ submissionId, code: "GXZ 201", title: "Departmental registry course", units: 3, semester: 2, level: 200, masterCourseId: "g6-dept" }),
      }),
    );
    expect(added.status).toBe(201);
    expect(
      (await prisma.submission.findUniqueOrThrow({ where: { id: submissionId } })).dismissedRegistryCourseIds,
    ).toEqual([]);
  });

  it("refuses a department's change or removal of a General Education row", async () => {
    const gst = await row("GST 118");
    expect(gst).not.toBeNull();
    const removed = (await call(deleteCourseRow, gst!.id, "DELETE", { confirm: "DELETE" })) as Response;
    expect(removed.status).toBe(403);
    expect(await removed.json()).toMatchObject({ code: "GENERAL_EDUCATION_LOCKED" });
    const changed = (await call(updateCourseRow, gst!.id, "PATCH", { units: 3 })) as Response;
    expect(changed.status).toBe(403);
    // Saving it unchanged (the course table saves every row) is fine.
    const same = (await call(updateCourseRow, gst!.id, "PATCH", { code: "GST 118", units: 2, semester: 1, level: 100 })) as Response;
    expect(same.status).toBe(200);
    expect(await row("GST 118")).toMatchObject({ units: 2 });
  });
});

// C1 and C3: the section 4.6 calendar loaded into a cycle, and the deadlines
// each person sees on launch day (Thursday, November 26, 2026).
describe("cycle calendar (C1) and countdowns (C3)", () => {
  const cycleId = "calendar-cycle";
  const submissionId = "calendar-submission";
  const settings = JSON.parse(
    readFileSync(join(process.cwd(), "data/calendar/2027-2031.json"), "utf8"),
  ) as CalendarSettings;

  beforeAll(async () => {
    await prisma.reviewCycle.create({
      data: { id: cycleId, name: "2027-2031 Bulletin Development Cycle (test)", createdById: ids.super, isActive: true },
    });
    await prisma.submission.create({
      data: { id: submissionId, title: "Calendar Bulletin", programmeId: ids.programmeA, createdById: ids.hod, cycleId },
    });
  });

  afterAll(async () => {
    vi.useRealTimers();
    await prisma.submission.deleteMany({ where: { id: submissionId } });
    await prisma.reviewCycle.deleteMany({ where: { id: cycleId } });
  });

  const deadlinesFor = async (userId: string, query = "") => {
    authState.userId = userId;
    const response = await getDeadlines(new NextRequest(`http://localhost/api/calendar/desk${query}`));
    expect(response.status).toBe(200);
    return response.json();
  };

  it("loads the calendar, sets when Submit opens, and can be loaded again without touching extensions", async () => {
    const loaded = await prisma.$transaction((tx) => applyCalendarSettings(tx, cycleId, settings));
    expect(loaded).toEqual({ phases: 10, checkpoints: 17, holidays: 6, quietPeriods: 1 });
    const cycle = await prisma.reviewCycle.findUniqueOrThrow({ where: { id: cycleId } });
    // F0: midnight WAT on Monday, December 14, 2026.
    expect(cycle.submissionsOpenAt?.toISOString()).toBe("2026-12-13T23:00:00.000Z");
    expect(cycle.workingWeek).toEqual(["MON", "TUE", "WED", "THU", "FRI"]);

    await prisma.cycleExtension.create({
      data: {
        cycleId,
        scope: "DEPARTMENT",
        targetId: ids.departmentB,
        phase: 1,
        newDueAt: new Date("2027-02-12T00:00:00Z"),
        reason: "Test extension",
        approvedById: ids.admin,
      },
    });
    await prisma.$transaction((tx) => applyCalendarSettings(tx, cycleId, settings));
    expect(await prisma.cyclePhase.count({ where: { cycleId } })).toBe(10);
    expect(await prisma.cycleCheckpoint.count({ where: { cycleId } })).toBe(17);
    expect(await prisma.cycleExtension.count({ where: { cycleId } })).toBe(1);
  });

  it("shows each person their own deadline on launch day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T08:00:00+01:00"));
    try {
      const head = await deadlinesFor(ids.hod);
      expect(head.cycle.id).toBe(cycleId);
      expect(head.desk).toMatchObject({
        label: "Departmental Drafting",
        headline: "70 days left",
        nextLine: "Next: CP1 on Friday, December 11, 2026 (15 days)",
        workingDaysLine: "44 working days left",
        statusLabel: "On track",
      });
      expect(head.phases).toBeUndefined();
      expect(head.programmes.map((item: { submissionId: string }) => item.submissionId)).toContain(submissionId);

      const dean = await deadlinesFor(ids.dean);
      expect(dean.desk.label).toBe("School Board Harmonisation");

      const programme = await deadlinesFor(ids.hod, `?submissionId=${submissionId}`);
      expect(programme.programme).toMatchObject({ label: "Departmental Drafting", headline: "70 days left" });
    } finally {
      vi.useRealTimers();
    }

    // An admin's two-step check runs on the real clock, so the list is read today.
    const admin = await deadlinesFor(ids.admin);
    expect(admin.phases).toHaveLength(10);
    expect(admin.phases[0]).toMatchObject({ name: "Departmental Drafting", due: "Thursday, February 4, 2027" });
    expect(admin.programmes).toBeUndefined();
  });
});

// D2: the roster import writes people with their units, updates someone
// already there, keeps a coordinator's programmes to the roster's, and logs
// each person.
describe("roster import (D2)", () => {
  const emails = ["roster.head@babcock.edu.ng", "roster.coordinator@babcock.edu.ng"];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
  });

  const platformNow = async () => {
    const [schools, departments, programmes, users, lookups] = await Promise.all([
      prisma.school.findMany({ select: { id: true, code: true, name: true } }),
      prisma.department.findMany({ select: { id: true, code: true, name: true, schoolId: true } }),
      prisma.programme.findMany({ select: { id: true, code: true, name: true, departmentId: true } }),
      prisma.user.findMany({
        select: {
          id: true, email: true, firstName: true, lastName: true, role: true, isActive: true,
          title: true, whatsapp: true, isActing: true, schoolId: true, departmentId: true,
          programmeAssignments: { select: { programmeId: true } },
        },
      }),
      loadCodeLookups(prisma),
    ]);
    return {
      schools,
      departments,
      programmes,
      users: users.map(({ programmeAssignments, ...user }) => ({
        ...user,
        programmeIds: programmeAssignments.map((item) => item.programmeId),
      })),
      lookups,
    };
  };

  it("imports, then updates, and changes nothing the second time", async () => {
    const department = await prisma.department.findUniqueOrThrow({ where: { id: ids.departmentA } });
    const programme = await prisma.programme.findUniqueOrThrow({ where: { id: ids.programmeA } });
    const rows: RosterRow[] = [
      { sheet: "Heads of Department", rowNumber: 2, unitCode: department.code, title: "Dr.", fullName: "Roster Head", email: emails[0], acting: "Yes", whatsapp: "0803 000 0000" },
      { sheet: "Programme coordinators", rowNumber: 2, unitCode: programme.code, title: "Dr.", fullName: "Roster Coordinator", email: emails[1], acting: "", whatsapp: "" },
    ];

    const first = planRoster(rows, await platformNow());
    expect(first.problems).toEqual([]);
    expect(await prisma.$transaction((tx) => applyRoster(tx, first, ids.super))).toEqual({ created: 2, updated: 0 });
    const head = await prisma.user.findUniqueOrThrow({ where: { email: emails[0] } });
    expect(head).toMatchObject({
      role: "HOD",
      departmentId: ids.departmentA,
      schoolId: department.schoolId,
      isActing: true,
      whatsapp: "+2348030000000",
      title: "Dr.",
    });
    const coordinator = await prisma.user.findUniqueOrThrow({
      where: { email: emails[1] },
      include: { programmeAssignments: true },
    });
    expect(coordinator.programmeAssignments.map((item) => item.programmeId)).toEqual([ids.programmeA]);
    expect(await prisma.activityLog.count({ where: { action: "USER_CREATED_FROM_ROSTER", entityId: head.id } })).toBe(1);

    // The roster changes the head's acting status: an update, nothing else.
    const second = planRoster([{ ...rows[0], acting: "No" }, rows[1]], await platformNow());
    expect(second.people.map((person) => person.action)).toEqual(["update", "unchanged"]);
    await prisma.$transaction((tx) => applyRoster(tx, second, ids.super));
    expect((await prisma.user.findUniqueOrThrow({ where: { email: emails[0] } })).isActing).toBe(false);

    const third = planRoster([{ ...rows[0], acting: "No" }, rows[1]], await platformNow());
    expect(third.people.every((person) => person.action === "unchanged")).toBe(true);
  });

  it("refuses to change a Super Administrator from the roster", async () => {
    const superAdmin = await prisma.user.findUniqueOrThrow({ where: { id: ids.super } });
    const department = await prisma.department.findUniqueOrThrow({ where: { id: ids.departmentA } });
    const plan = planRoster(
      [{ sheet: "Heads of Department", rowNumber: 9, unitCode: department.code, title: "", fullName: "Some One", email: superAdmin.email, acting: "", whatsapp: "" }],
      await platformNow(),
    );
    // A Super Admin's address may not be a babcock.edu.ng one in the tests;
    // either way the row is refused and nothing changes.
    expect(plan.people).toEqual([]);
    expect(plan.problems.length).toBeGreaterThan(0);
  });
});

// D3: invitations to Heads, coordinators and Deans, with their school's DAP
// officer as the help contact, and sign-in tracking.
describe("invitations and sign-in tracking (D3)", () => {
  const people = {
    head: { id: "d3-head", email: "d3.head@babcock.edu.ng", role: "HOD" as const },
    officer: { id: "d3-officer", email: "d3.officer@babcock.edu.ng", role: "ADMIN" as const },
    gone: { id: "d3-gone", email: "d3.gone@babcock.edu.ng", role: "HOD" as const },
  };

  beforeAll(async () => {
    const department = await prisma.department.findUniqueOrThrow({ where: { id: ids.departmentA } });
    await prisma.user.create({
      data: { ...people.head, firstName: "Ngozi", lastName: "Eze", title: "Dr.", departmentId: department.id, schoolId: department.schoolId },
    });
    await prisma.user.create({
      data: { ...people.officer, firstName: "Officer", lastName: "One", title: "Mrs.", whatsapp: "+2348030000000", schoolId: department.schoolId },
    });
    await prisma.user.create({
      data: { ...people.gone, firstName: "Gone", lastName: "Away", departmentId: department.id, isActive: false },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: Object.values(people).map((person) => person.id) } } });
  });

  const withEmail = async <T,>(run: (sent: { to: string[]; subject: string; text: string; from: string; reply_to?: string[] }[]) => Promise<T>) => {
    const sent: { to: string[]; subject: string; text: string; from: string; reply_to?: string[] }[] = [];
    const previous = { key: process.env.RESEND_API_KEY, replyTo: process.env.INVITATION_REPLY_TO };
    process.env.RESEND_API_KEY = "test-key";
    process.env.INVITATION_REPLY_TO = "deputy.director@babcock.edu.ng";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}", { status: 200 });
    });
    try {
      return await run(sent);
    } finally {
      fetchSpy.mockRestore();
      if (previous.key === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = previous.key;
      if (previous.replyTo === undefined) delete process.env.INVITATION_REPLY_TO;
      else process.env.INVITATION_REPLY_TO = previous.replyTo;
    }
  };

  it("sends one person's invitation with their school's DAP officer, and records it", async () => {
    await withEmail(async (sent) => {
      expect(await sendInvitation(people.head.id)).toMatchObject({ sent: true });
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        to: [people.head.email],
        subject: "Your Academic Bulletin desk is ready",
        from: "Directorate of Academic Planning, Babcock University <notifications@academicplanning.app>",
        reply_to: ["deputy.director@babcock.edu.ng"],
      });
      expect(sent[0].text).toContain("Dear Dr. Eze,");
      expect(sent[0].text).toContain("Help: Mrs. Officer One, d3.officer@babcock.edu.ng, WhatsApp +2348030000000");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: people.head.id } })).invitedAt).not.toBeNull();

      // Admins and deactivated people get none.
      expect(await sendInvitation(people.officer.id)).toMatchObject({ sent: false });
      expect(await sendInvitation(people.gone.id)).toMatchObject({ sent: false });
      expect(sent).toHaveLength(1);
    });
  });

  it("waits for 8:00 am WAT on November 26 before sending the rest", async () => {
    await withEmail(async (sent) => {
      expect(await sendDueInvitations(new Date("2026-11-26T07:59:00+01:00"))).toEqual({ due: false, results: [] });
      expect(sent).toHaveLength(0);
      const later = await sendDueInvitations(new Date("2026-11-26T08:00:00+01:00"));
      expect(later.due).toBe(true);
      // The head was invited already; nobody is sent a second one this way.
      expect(later.results.map((result) => result.email)).not.toContain(people.head.email);
    });
  });

  it("records the first sign-in once, and keeps it", async () => {
    const hd = "babcock.edu.ng";
    expect(await allowGoogleSignIn({ email: people.head.email, email_verified: true, hd })).toBe(true);
    const first = (await prisma.user.findUniqueOrThrow({ where: { id: people.head.id } })).firstSignInAt;
    expect(first).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await allowGoogleSignIn({ email: people.head.email, email_verified: true, hd })).toBe(true);
    const again = await prisma.user.findUniqueOrThrow({ where: { id: people.head.id } });
    expect(again.firstSignInAt).toEqual(first);
    expect(again.lastActiveAt!.getTime()).toBeGreaterThanOrEqual(first!.getTime());
  });
});
