import { afterAll, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import {
  type CodeStandard,
  applyCodeStandard,
  planCodeStandard,
  planHasChanges,
  readPlatformSnapshot,
} from "@/lib/units/code-standard";
import { loadCodeLookups } from "@/lib/units/code-aliases";

// Task A5 on a real database: codes change, ids stay, old codes still resolve,
// and a second run changes nothing. Uses its own codes (Z...) so the other
// integration tests' records are never touched.

const standard: CodeStandard = {
  schools: [{ oldCode: "ZQS", code: "ZQSC", name: "School of Code Standard Tests", reserved: false }],
  departments: [
    { oldCode: "OLD", code: "ZQSC-NEW", schoolCode: "ZQSC", name: "Department of New Codes" },
    { oldCode: null, code: "ZQSC-ADD", schoolCode: "ZQSC", name: "Department of Added Units" },
  ],
  programmes: [
    { oldCode: "ZQS-OLD-PRG", code: "ZQSC-NEW-PRG", departmentCode: "ZQSC-NEW", officialName: "B.Sc. (Hons.) Standard Testing", isNewProgramme: false },
    { oldCode: null, code: "ZQSC-ADD-FRE", departmentCode: "ZQSC-ADD", officialName: "B.Sc. (Hons.) Fresh Programme", isNewProgramme: true },
  ],
  ownershipMoves: [{ prefix: "ZQT", departmentCode: "ZQSC-ADD", schoolCode: "ZQSC" }],
};

// Plans against our own records only.
async function ownSnapshot() {
  const all = await readPlatformSnapshot(prisma);
  return {
    schools: all.schools.filter((s) => s.code.startsWith("ZQS")),
    departments: all.departments.filter((d) => d.code.startsWith("ZQS")),
    programmes: all.programmes.filter((p) => p.code.startsWith("ZQS")),
    courses: all.courses.filter((c) => c.code.startsWith("ZQT")),
  };
}

describe("applying the code standard (A5)", () => {
  afterAll(async () => {
    await prisma.codeAlias.deleteMany({ where: { oldCode: { startsWith: "ZQS" } } });
    await prisma.masterCourse.deleteMany({ where: { code: { startsWith: "ZQT" } } });
    await prisma.school.deleteMany({ where: { code: { startsWith: "ZQS" } } });
  });

  it("changes codes in place, keeps aliases, moves courses, and is safe to run again", async () => {
    const school = await prisma.school.create({ data: { code: "ZQS", name: "School of Code Standard Tests" } });
    const department = await prisma.department.create({
      data: { code: "ZQS-OLD", name: "Department of New Codes", schoolId: school.id },
    });
    const programme = await prisma.programme.create({
      data: { code: "ZQS-OLD-PRG", name: "Standard Testing", degreeType: "BSc", duration: 4, departmentId: department.id },
    });
    await prisma.masterCourse.create({
      data: { code: "ZQT 101", title: "Moving course", units: 0, level: 100, semester: null, ownerDeptId: department.id },
    });

    const plan = planCodeStandard(standard, await ownSnapshot());
    expect(planHasChanges(plan)).toBe(true);
    await prisma.$transaction((tx) => applyCodeStandard(tx, plan));

    // Same records, new codes.
    expect(await prisma.school.findUniqueOrThrow({ where: { id: school.id } })).toMatchObject({ code: "ZQSC" });
    expect(await prisma.department.findUniqueOrThrow({ where: { id: department.id } })).toMatchObject({ code: "ZQSC-NEW" });
    expect(await prisma.programme.findUniqueOrThrow({ where: { id: programme.id } })).toMatchObject({
      code: "ZQSC-NEW-PRG",
      degreeType: "B.Sc.",
      isNew: false,
    });
    const added = await prisma.programme.findUniqueOrThrow({
      where: { code: "ZQSC-ADD-FRE" },
      include: { department: true },
    });
    expect(added).toMatchObject({ name: "Fresh Programme", isNew: true, isHidden: false, duration: 4 });
    expect(added.department.code).toBe("ZQSC-ADD");
    expect(
      await prisma.masterCourse.findUniqueOrThrow({ where: { code: "ZQT 101" }, select: { ownerDeptId: true, ownership: true } }),
    ).toEqual({ ownerDeptId: added.departmentId, ownership: "DEPARTMENT" });

    // Old codes still resolve, with a warning naming the new one.
    const lookups = await loadCodeLookups(prisma);
    expect(lookups.department.resolve("ZQS-OLD")).toMatchObject({ id: department.id, warning: expect.stringContaining("ZQSC-NEW") });
    expect(lookups.programme.resolve("ZQS-OLD-PRG")).toMatchObject({ id: programme.id });
    expect(lookups.school.resolve("ZQSC")).toEqual({ id: school.id });

    // A second run finds nothing left to do.
    expect(planHasChanges(planCodeStandard(standard, await ownSnapshot()))).toBe(false);
  });
});
