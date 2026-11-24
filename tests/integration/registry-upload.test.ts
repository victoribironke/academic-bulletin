import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { applyRegistryUpload, planIsReady, planRegistryUpload } from "@/lib/imports/registry-upload";

// The Registry upload on a real database (B2, B13, B16, B17): plan first,
// then write. Uses its own codes (ZRU...) so other tests' records are never
// touched.

const row = (values: Record<string, unknown>) => ({
  "Course Type": "CORE",
  Ownership: "DEPARTMENT",
  "Owner Department Code": "ZRU-DEP",
  "Programme Codes": "ZRU-DEP-PRG",
  "Curriculum Source": "BU Bulletin 2023-2027",
  Discoverable: "YES",
  ...values,
});

describe("Registry upload (B2, B13, B16, B17)", () => {
  let programmeId = "";

  beforeAll(async () => {
    const school = await prisma.school.create({ data: { code: "ZRU", name: "School of Upload Tests" } });
    const department = await prisma.department.create({
      data: { code: "ZRU-DEP", name: "Department of Upload Tests", schoolId: school.id },
    });
    programmeId = (
      await prisma.programme.create({
        data: { code: "ZRU-DEP-PRG", name: "Upload Testing", degreeType: "B.Sc.", duration: 4, departmentId: department.id },
      })
    ).id;
    await prisma.masterCourse.create({
      data: { code: "ZRU 202", title: "Old Course Under This Code", units: 2, level: 200, semester: 2, description: "Describes the old course", ownerDeptId: department.id },
    });
    await prisma.masterCourse.create({
      data: {
        code: "ZRU 201",
        title: "Existing Course",
        units: 2,
        level: 200,
        semester: 1,
        description: "National curriculum description",
        ownerDeptId: department.id,
      },
    });
  });

  afterAll(async () => {
    await prisma.masterCourse.deleteMany({ where: { code: { contains: "ZRU" } } });
    await prisma.school.deleteMany({ where: { code: "ZRU" } });
  });

  const rows = [
    row({ "Course Code": "BU-ZRU 101", "Course Title": "Health Principles", Units: 2, Level: 100, Semester: 1, Description: "Babcock text" }),
    row({ "Course Code": "ZRU 390", "Course Title": "Research Project", Units: 6, Level: 300, Semester: 2 }),
    row({ "Course Code": "ZRU 391", "Course Title": "Research Project", Units: 6, Level: 300, Semester: 2 }),
    row({ "Course Code": "BU-ZRU 101", "Course Title": "Health Principles", Units: 2, Level: 100, Semester: 1 }),
    row({ "Course Code": "ZRU 301", "Course Title": "Clinical Posting", Units: 0, Level: 300, Semester: "" }),
    row({ "Course Code": "ZRU 201", "Course Title": "Existing Course", Units: 3, Level: 200, Semester: 1, Description: "" }),
    row({ "Course Code": "ZRU 202", "Course Title": "A Different Course", Units: 2, Level: 200, Semester: 2, Description: "" }),
  ];

  it("plans new courses, repeats and changes without writing anything", async () => {
    const plan = await planRegistryUpload(rows, { keepExistingWhenEmpty: true });
    expect(planIsReady(plan)).toBe(true);
    expect(plan.skipped.map((note) => note.code)).toEqual(["BU-ZRU 101"]);
    expect(plan.courses.filter((course) => course.action === "create").map((course) => course.code)).toEqual([
      "BU-ZRU 101",
      "ZRU 390",
      "ZRU 391",
      "ZRU 301",
    ]);
    const update = plan.courses.find((course) => course.code === "ZRU 201")!;
    expect(update.action).toBe("update");
    expect(update.changes).toContain("units: 2 -> 3");
    expect(update.kept).toContain("description");
    // Under a new title the old text would describe another course, so it isn't kept.
    const renamed = plan.courses.find((course) => course.code === "ZRU 202")!;
    expect(renamed.kept).toEqual([]);
    expect(renamed.changes).toContain('description: "Describes the old course" -> empty');
    expect(await prisma.masterCourse.count({ where: { code: { contains: "ZRU" } } })).toBe(2);

    // The upload screen writes the row as it is: the empty cell clears the description.
    const screenPlan = await planRegistryUpload(rows);
    expect(screenPlan.courses.find((course) => course.code === "ZRU 201")!.changes.some((change) => change.startsWith("description:"))).toBe(true);
  });

  it("writes the plan: BU- codes, shared titles, 0-unit sessional courses, links, kept text", async () => {
    const plan = await planRegistryUpload(rows, { keepExistingWhenEmpty: true });
    const label = `test file ${Date.now()}`;
    const result = await applyRegistryUpload(plan, { label });
    expect(result).toMatchObject({ created: 4, updated: 2, unchanged: 0, linked: 6 });

    const courses = await prisma.masterCourse.findMany({ where: { code: { contains: "ZRU" } }, orderBy: { code: "asc" } });
    expect(courses.map((course) => course.code)).toEqual(["BU-ZRU 101", "ZRU 201", "ZRU 202", "ZRU 301", "ZRU 390", "ZRU 391"]);
    expect(courses.find((course) => course.code === "ZRU 202")).toMatchObject({ title: "A Different Course", description: null });
    expect(courses.find((course) => course.code === "ZRU 201")).toMatchObject({
      units: 3,
      description: "National curriculum description",
    });
    expect(courses.find((course) => course.code === "ZRU 301")).toMatchObject({ units: 0, semester: null });
    expect(courses.find((course) => course.code === "BU-ZRU 101")).toMatchObject({ description: "Babcock text" });
    expect(await prisma.programmeCourse.count({ where: { programmeId } })).toBe(6);
    expect(
      await prisma.activityLog.count({ where: { action: "REGISTRY_COURSES_IMPORTED", description: { contains: `(${label})` } } }),
    ).toBe(1);

    // A second run finds nothing new and adds no links.
    const again = await planRegistryUpload(rows, { keepExistingWhenEmpty: true });
    expect(again.courses.every((course) => course.action === "update")).toBe(true);
    expect(await applyRegistryUpload(again, {})).toMatchObject({ created: 0, updated: 0, unchanged: 6, linked: 0 });
  });

  it("refuses to write when a row has an unknown owner", async () => {
    const plan = await planRegistryUpload([
      row({ "Course Code": "ZRU 499", "Course Title": "Orphan", Units: 3, Level: 400, Semester: 1, "Owner Department Code": "ZRU-NONE" }),
    ]);
    expect(plan.ownerIssues).toEqual([{ row: 2, errors: ["Unknown department code ZRU-NONE."] }]);
    await expect(applyRegistryUpload(plan, {})).rejects.toThrow("rows to fix");
    expect(await prisma.masterCourse.findUnique({ where: { code: "ZRU 499" } })).toBeNull();
  });
});
