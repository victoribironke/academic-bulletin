import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import {
  applyCodeCleanup,
  codeCleanupReport,
  comparableTitle,
  courseCodeKey,
  planCodeCleanup,
} from "@/lib/courses/code-cleanup";
import { findSameCodeCourse } from "@/lib/courses/code-key";

// Task B3 on a real database: one code format, merging only true duplicates,
// and the database rule afterwards. Uses its own codes (ZCC...).

const actorId = "zcc-admin";
const ids = {
  school: "zcc-school",
  department: "zcc-department",
  programmeA: "zcc-programme-a",
  programmeB: "zcc-programme-b",
  cycle: "zcc-cycle",
  draft: "zcc-draft",
  // ZCC101 and ZCC 101: the same course twice.
  oldForm: "zcc-101-old",
  standard: "zcc-101",
  // ZCC102: only needs a space.
  lone: "zcc-102",
  // ZCC103 and ZCC 103: different titles, so DAP decides.
  alpha: "zcc-103-alpha",
  beta: "zcc-103-beta",
  // ZCC 201 needs ZCC101 first.
  needsIt: "zcc-201",
};

describe("course code clean-up (B3)", () => {
  beforeAll(async () => {
    await prisma.user.create({ data: { id: actorId, email: "zcc-admin@babcock.edu.ng", firstName: "Code", lastName: "Admin", role: "ADMIN" } });
    await prisma.school.create({ data: { id: ids.school, code: "ZCC", name: "School of Code Tests" } });
    await prisma.department.create({ data: { id: ids.department, code: "ZCC-DEP", name: "Department of Code Tests", schoolId: ids.school } });
    for (const [id, name] of [[ids.programmeA, "Code Testing A"], [ids.programmeB, "Code Testing B"]]) {
      await prisma.programme.create({ data: { id, code: `${id.toUpperCase()}`, name, degreeType: "B.Sc.", duration: 4, departmentId: ids.department } });
    }
    const course = (id: string, code: string, title: string, extra: object = {}) =>
      prisma.masterCourse.create({ data: { id, code, title, units: 2, level: Number(code.match(/\d{3}/)![0].slice(0, 1)) * 100, semester: 1, ownerDeptId: ids.department, ...extra } });
    await course(ids.oldForm, "ZCC101", "Code tests", { courseContent: "Only the old record has content" });
    await course(ids.standard, "ZCC 101", "Code Tests");
    await course(ids.lone, "ZCC102", "Lonely code");
    await course(ids.alpha, "ZCC103", "Alpha");
    await course(ids.beta, "ZCC 103", "Beta");
    await course(ids.needsIt, "ZCC 201", "Builds on code tests", { prerequisites: { connect: { id: ids.oldForm } } });

    await prisma.programmeCourse.createMany({
      data: [
        { programmeId: ids.programmeA, courseId: ids.oldForm, titleOverride: "Code tests for A", levelOverride: 300 },
        { programmeId: ids.programmeB, courseId: ids.oldForm },
        { programmeId: ids.programmeA, courseId: ids.standard },
      ],
    });
    await prisma.reviewCycle.create({ data: { id: ids.cycle, name: "ZCC cycle", createdById: actorId } });
    await prisma.submission.create({
      data: {
        id: ids.draft,
        title: "ZCC draft",
        programmeId: ids.programmeB,
        createdById: actorId,
        cycleId: ids.cycle,
        dismissedRegistryCourseIds: [ids.oldForm],
      },
    });
    await prisma.course.create({
      data: { id: "zcc-row", submissionId: ids.draft, code: "ZCC101", title: "Code tests", units: 2, semester: 1, level: 100, masterCourseId: ids.oldForm },
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "master_courses_code_compact_key"');
    await prisma.submission.deleteMany({ where: { id: ids.draft } });
    await prisma.reviewCycle.deleteMany({ where: { id: ids.cycle } });
    await prisma.masterCourse.deleteMany({ where: { code: { startsWith: "ZCC" } } });
    await prisma.programme.deleteMany({ where: { departmentId: ids.department } });
    await prisma.department.deleteMany({ where: { id: ids.department } });
    await prisma.school.deleteMany({ where: { id: ids.school } });
    await prisma.archivedRecord.deleteMany({ where: { entityId: { startsWith: "zcc-" } } });
    await prisma.activityLog.deleteMany({ where: { actorId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  });

  it("treats codes as the same whatever their spacing or hyphens", () => {
    expect(courseCodeKey("ZCC101")).toBe(courseCodeKey("zcc 101"));
    expect(courseCodeKey("ZCC-101")).toBe(courseCodeKey("ZCC 101"));
    expect(courseCodeKey("BU-GST 112")).not.toBe(courseCodeKey("GST 112"));
    expect(courseCodeKey("bu gst112")).toBe(courseCodeKey("BU-GST 112"));
    expect(comparableTitle("Software Configuration Management & Maintenance")).toBe(
      comparableTitle("Software configuration management and maintenance"),
    );
    expect(comparableTitle("General Biology Ii")).toBe(comparableTitle("General Biology II"));
    expect(comparableTitle("Practical Chemistry I")).not.toBe(comparableTitle("General Chemistry Practical I"));
  });

  it("plans: merges true duplicates, tidies lone codes, and sends different courses to DAP", async () => {
    const plan = await planCodeCleanup(prisma);
    const merge = plan.merges.find((item) => item.code === "ZCC 101");
    expect(merge?.keep.id).toBe(ids.standard);
    expect(merge?.merge.map((course) => course.id)).toEqual([ids.oldForm]);
    expect(plan.renames.find((item) => item.id === ids.lone)?.to).toBe("ZCC 102");
    const group = plan.forDap.find((item) => item.code === "ZCC 103");
    expect(group?.why).toBe("The titles differ.");
    expect(group?.courses.map((course) => course.id).sort()).toEqual([ids.alpha, ids.beta].sort());
    expect(plan.draftRenames.find((row) => row.id === "zcc-row")).toMatchObject({ from: "ZCC101", to: "ZCC 101" });

    const report = codeCleanupReport(plan, "B3 test");
    expect(report).toContain("### ZCC 103");
    expect(report).toContain("| ZCC102 | ZCC 102 | Lonely code |");
    // Nothing written by planning.
    expect(await prisma.masterCourse.count({ where: { id: ids.oldForm } })).toBe(1);
  });

  it("applies: keeps every link, draft row, prerequisite and mark, and archives the duplicate", async () => {
    const plan = await planCodeCleanup(prisma);
    await applyCodeCleanup(plan, { actorId }, prisma);

    expect(await prisma.masterCourse.count({ where: { id: ids.oldForm } })).toBe(0);
    const kept = await prisma.masterCourse.findUniqueOrThrow({
      where: { id: ids.standard },
      select: {
        code: true,
        courseContent: true,
        programmeLinks: { select: { programmeId: true, titleOverride: true, levelOverride: true }, orderBy: { programmeId: "asc" } },
        prerequisiteOf: { select: { id: true } },
        submissionCourses: { select: { id: true, code: true } },
      },
    });
    expect(kept).toEqual({
      code: "ZCC 101",
      courseContent: "Only the old record has content",
      programmeLinks: [
        { programmeId: ids.programmeA, titleOverride: "Code tests for A", levelOverride: 300 },
        { programmeId: ids.programmeB, titleOverride: null, levelOverride: null },
      ],
      prerequisiteOf: [{ id: ids.needsIt }],
      submissionCourses: [{ id: "zcc-row", code: "ZCC 101" }],
    });
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: ids.draft } })).dismissedRegistryCourseIds).toEqual([ids.standard]);
    expect((await prisma.masterCourse.findUniqueOrThrow({ where: { id: ids.lone } })).code).toBe("ZCC 102");
    expect(
      (await prisma.archivedRecord.findFirstOrThrow({ where: { entityType: "MASTER_COURSE", entityId: ids.oldForm } })).label,
    ).toBe("ZCC101 Code tests (merged into ZCC 101)");

    // DAP's group is untouched.
    expect(await prisma.masterCourse.count({ where: { id: { in: [ids.alpha, ids.beta] } } })).toBe(2);
    const again = await planCodeCleanup(prisma);
    expect(again.merges.some((item) => item.code.startsWith("ZCC"))).toBe(false);
    expect(again.renames.some((item) => item.code.startsWith("ZCC"))).toBe(false);
    expect(again.forDap.some((item) => item.code === "ZCC 103")).toBe(true);
  });

  it("finds the same code in any spacing, and the database rule refuses a second one", async () => {
    expect((await findSameCodeCourse("zcc102"))?.id).toBe(ids.lone);
    expect(await findSameCodeCourse("zcc102", ids.lone)).toBeNull();

    // Once DAP has decided (here: Alpha keeps another code), the rule can go in.
    await prisma.masterCourse.update({ where: { id: ids.alpha }, data: { code: "ZCC 104" } });
    const sql = readFileSync("prisma/migrations/20261124130000_course_code_unique/migration.sql", "utf8");
    await prisma.$executeRawUnsafe(sql.split("\n").filter((line) => !line.startsWith("--")).join("\n"));
    await expect(
      prisma.masterCourse.create({ data: { code: "ZCC-102", title: "Sneaky copy", units: 2, level: 100, semester: 1 } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });
});
