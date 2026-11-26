import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { waitingWorkFor } from "@/lib/desk/waiting";
import type { ApiUser } from "@/lib/api-auth";

// Task T1 for the other desks in R1: Academic Planning's own queues and the
// General Education desk that DAP runs (DEC8). Uses its own ids (zdq-...).

const ids = {
  school: "zdq-school",
  department: "zdq-dept",
  programme: "zdq-prog",
  head: "zdq-head",
  admin: "zdq-admin",
  officer: "zdq-officer",
  cycle: "zdq-cycle",
  draft: "zdq-draft",
};
const users = [ids.head, ids.admin, ids.officer];
const asUser = (id: string, role: ApiUser["role"], schoolId: string | null): ApiUser => ({
  id,
  email: `${id}@babcock.edu.ng`,
  role,
  isActive: true,
  departmentId: null,
  schoolId,
  programmeIds: [],
});

describe("Academic Planning's desk queues (T1)", () => {
  beforeAll(async () => {
    await prisma.school.createMany({
      data: [
        { id: ids.school, code: "ZDQS", name: "School of Desk Tests" },
        { id: "zdq-other-school", code: "ZDQO", name: "Other School of Desk Tests" },
      ],
    });
    await prisma.department.create({ data: { id: ids.department, code: "ZDQS-D", name: "Department of Desks", schoolId: ids.school } });
    await prisma.programme.create({ data: { id: ids.programme, code: "ZDQS-D-P", name: "Desk Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.department } });
    await prisma.user.createMany({
      data: [
        { id: ids.head, email: "zdq-head@babcock.edu.ng", firstName: "Desk", lastName: "Head", role: "HOD", schoolId: ids.school, departmentId: ids.department },
        { id: ids.admin, email: "zdq-admin@babcock.edu.ng", firstName: "Planning", lastName: "Desk", role: "ADMIN" },
        { id: ids.officer, email: "zdq-officer@babcock.edu.ng", firstName: "School", lastName: "Officer", role: "ADMIN", schoolId: "zdq-other-school" },
      ],
    });
    await prisma.reviewCycle.create({
      data: {
        id: ids.cycle,
        name: "ZDQ cycle",
        createdById: ids.admin,
        startedAt: new Date("2099-01-01T00:00:00Z"),
        phases: { create: { phase: 1, name: "Departmental Drafting", label: "Drafting", scope: "PROGRAMME", desk: "HOD", dueAt: new Date("2099-02-04") } },
      },
    });
    await prisma.submission.create({ data: { id: ids.draft, title: "ZDQ draft", programmeId: ids.programme, cycleId: ids.cycle, createdById: ids.head } });
    await prisma.dapQuestion.create({
      data: { submissionId: ids.draft, section: "overview", question: "Which vision?", askedById: ids.head, askedAt: new Date("2099-01-05T09:00:00Z"), dueAt: new Date("2099-01-06T09:00:00Z") },
    });
    await prisma.courseChangeRequest.create({ data: { submissionId: ids.draft, kind: "ADD", courseCode: "ZDQ 101", details: "Please add it.", requestedById: ids.head } });
    await prisma.masterCourse.createMany({
      data: [
        { id: "zdq-ge", code: "BU-GST 990", title: "Desk General Studies", units: 2, level: 100, semester: 1 },
        { id: "zdq-free", code: "ZDQ 201", title: "Ownerless Course", units: 2, level: 200, semester: 1 },
      ],
    });
    await prisma.programmeCourse.create({ data: { programmeId: ids.programme, courseId: "zdq-free" } });
  });

  afterAll(async () => {
    await prisma.reviewCycle.deleteMany({ where: { id: ids.cycle } });
    await prisma.masterCourse.deleteMany({ where: { id: { in: ["zdq-ge", "zdq-free"] } } });
    await prisma.programme.deleteMany({ where: { id: ids.programme } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.department.deleteMany({ where: { id: ids.department } });
    await prisma.school.deleteMany({ where: { id: { in: [ids.school, "zdq-other-school"] } } });
  });

  it("shows DAP its questions, requests, the General Education desk and the courses with no owner", async () => {
    const items = await waitingWorkFor(asUser(ids.admin, "ADMIN", null), new Date("2099-01-08T09:00:00Z"));
    const byKind = Object.fromEntries(items.map((item) => [item.kind, item]));
    expect(byKind.QUESTIONS).toMatchObject({ programme: "Ask DAP", href: "/dap-questions" });
    expect(byKind.QUESTIONS.text).toMatch(/question(s)? waiting for an answer; \d+ past the one working day/);
    expect(byKind.COURSE_REQUESTS.href).toBe("/course-requests");
    expect(byKind.GENERAL_EDUCATION).toMatchObject({ programme: "General Education desk", href: "/courses-we-own?owner=ge" });
    expect(byKind.NO_OWNER).toMatchObject({ programme: "Course Owners", href: "/courses-we-own?owner=none" });
  });

  it("keeps an officer to their own school's questions and requests", async () => {
    const items = await waitingWorkFor(asUser(ids.officer, "ADMIN", "zdq-other-school"), new Date("2099-01-08T09:00:00Z"));
    expect(items.some((item) => item.key === "dap-questions" && item.text.startsWith("1 question"))).toBe(false);
    expect(items.some((item) => item.kind === "GENERAL_EDUCATION" || item.kind === "NO_OWNER")).toBe(false);
  });
});
