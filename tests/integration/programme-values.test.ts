import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { applyProgrammeValues, planProgrammeValuesFromDatabase } from "@/lib/courses/programme-values";
import { propagateMasterCourseChanges } from "@/lib/courses/propagation";
import { loadCompletenessReport } from "@/lib/reports/registry-completeness";

// Task B14 on a real database: package file 09's values land on the links
// between courses and programmes, open drafts follow, and a Registry change
// doesn't overwrite a programme's own value. Uses its own codes (ZPV...).

const actorId = "zpv-admin";
const ids = {
  school: "zpv-school",
  department: "zpv-department",
  programmeA: "zpv-programme-a",
  programmeB: "zpv-programme-b",
  cycle: "zpv-cycle",
  draftA: "zpv-draft-a",
  draftB: "zpv-draft-b",
  archivedCycle: "zpv-archived-cycle",
  archivedDraft: "zpv-archived-draft",
  course: "zpv-201",
  other: "zpv-305",
  gst: "zpv-gst-440",
};

const record = (programmeCode: string, code: string, field: string, registry: number, uses: number) => ({
  Programme: programmeCode,
  "Programme Code": programmeCode,
  "Course Code": code,
  "Course Title": code,
  Field: field,
  "Registry value": registry,
  "This programme uses": uses,
});

const file = [
  record("ZPV-A", "ZPV 201", "Units", 3, 2),
  record("ZPV-A", "ZPV 201", "Semester", 1, 2),
  record("ZPV-B", "ZPV 305", "Level", 300, 400),
  record("ZPV-A", "BU-GST 440", "Semester", 1, 2),
];

describe("programme-specific course values (B14)", () => {
  beforeAll(async () => {
    await prisma.user.create({ data: { id: actorId, email: "zpv-admin@babcock.edu.ng", firstName: "Values", lastName: "Admin", role: "ADMIN" } });
    await prisma.school.create({ data: { id: ids.school, code: "ZPV", name: "School of Value Tests" } });
    await prisma.department.create({ data: { id: ids.department, code: "ZPV-DEP", name: "Department of Value Tests", schoolId: ids.school } });
    await prisma.programme.create({ data: { id: ids.programmeA, code: "ZPV-A", name: "Value Testing A", degreeType: "B.Sc.", duration: 4, departmentId: ids.department } });
    await prisma.programme.create({ data: { id: ids.programmeB, code: "ZPV-B", name: "Value Testing B", degreeType: "B.Sc.", duration: 4, departmentId: ids.department } });
    await prisma.masterCourse.create({ data: { id: ids.course, code: "ZPV 201", title: "Shared values", units: 3, level: 200, semester: 1, ownerDeptId: ids.department } });
    await prisma.masterCourse.create({ data: { id: ids.other, code: "ZPV 305", title: "Moved course", units: 2, level: 300, semester: 1, ownerDeptId: ids.department } });
    await prisma.masterCourse.create({ data: { id: ids.gst, code: "BU-GST 440", title: "E-Project Management and Simulation", units: 2, level: 400, semester: 1, ownerDeptId: ids.department } });
    await prisma.programmeCourse.createMany({
      data: [
        { programmeId: ids.programmeA, courseId: ids.course },
        { programmeId: ids.programmeB, courseId: ids.course },
        { programmeId: ids.programmeA, courseId: ids.gst },
      ],
    });
    await prisma.reviewCycle.create({ data: { id: ids.cycle, name: "ZPV cycle", createdById: actorId } });
    for (const [id, programmeId] of [[ids.draftA, ids.programmeA], [ids.draftB, ids.programmeB]]) {
      await prisma.submission.create({ data: { id, title: id, programmeId, createdById: actorId, cycleId: ids.cycle } });
    }
    // A draft in an archived cycle stays exactly as it was.
    await prisma.reviewCycle.create({ data: { id: ids.archivedCycle, name: "ZPV archived", createdById: actorId, isActive: false, archivedAt: new Date() } });
    await prisma.submission.create({ data: { id: ids.archivedDraft, title: "zpv archived", programmeId: ids.programmeA, createdById: actorId, cycleId: ids.archivedCycle } });
    await prisma.course.createMany({
      data: [
        { id: "zpv-row-archived", submissionId: ids.archivedDraft, code: "ZPV 201", title: "Shared values", units: 3, semester: 1, level: 200, masterCourseId: ids.course },
        // Still shows the Registry's values: follows the programme.
        { id: "zpv-row-a", submissionId: ids.draftA, code: "ZPV 201", title: "Shared values", units: 3, semester: 1, level: 200, masterCourseId: ids.course },
        // A General Education row (locked for Heads): follows the programme.
        { id: "zpv-row-gst", submissionId: ids.draftA, code: "BU-GST 440", title: "E-Project Management and Simulation", units: 2, semester: 1, level: 400, masterCourseId: ids.gst },
        // Programme B keeps the Registry's values for ZPV 201.
        { id: "zpv-row-b", submissionId: ids.draftB, code: "ZPV 201", title: "Shared values", units: 3, semester: 1, level: 200, masterCourseId: ids.course },
        // The Head already chose level 300 again... and a different one here: left alone.
        { id: "zpv-row-b-305", submissionId: ids.draftB, code: "ZPV 305", title: "Moved course", units: 2, semester: 1, level: 500, masterCourseId: ids.other },
      ],
    });
  });

  afterAll(async () => {
    await prisma.submission.deleteMany({ where: { id: { in: [ids.draftA, ids.draftB, ids.archivedDraft] } } });
    await prisma.reviewCycle.deleteMany({ where: { id: { in: [ids.cycle, ids.archivedCycle] } } });
    await prisma.masterCourse.deleteMany({ where: { id: { in: [ids.course, ids.other, ids.gst] } } });
    await prisma.programme.deleteMany({ where: { id: { in: [ids.programmeA, ids.programmeB] } } });
    await prisma.department.deleteMany({ where: { id: ids.department } });
    await prisma.school.deleteMany({ where: { id: ids.school } });
    await prisma.activityLog.deleteMany({ where: { actorId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  });

  it("plans the file's values with no code errors", async () => {
    const plan = await planProgrammeValuesFromDatabase(prisma, file);
    expect(plan.counts).toEqual({ fileRows: 4, matched: 4, codeErrors: 0 });
    expect(plan.changes.map((change) => [change.programmeCode, change.code, change.field, change.next, change.newLink])).toEqual([
      ["ZPV-A", "ZPV 201", "UNITS", 2, false],
      ["ZPV-A", "ZPV 201", "SEMESTER", 2, false],
      ["ZPV-B", "ZPV 305", "LEVEL", 400, true],
      ["ZPV-A", "BU-GST 440", "SEMESTER", 2, false],
    ]);
  });

  it("stores the values on the links and brings open drafts in line", async () => {
    const plan = await planProgrammeValuesFromDatabase(prisma, file);
    const result = await applyProgrammeValues(prisma, plan, { actorId });
    expect(result).toEqual({ linksUpdated: 2, linksAdded: 1, draftRowsUpdated: 3 });

    const link = (programmeId: string, courseId: string) =>
      prisma.programmeCourse.findUniqueOrThrow({ where: { programmeId_courseId: { programmeId, courseId } } });
    expect(await link(ids.programmeA, ids.course)).toMatchObject({ unitsOverride: 2, semesterOverride: 2, levelOverride: null });
    expect(await link(ids.programmeB, ids.course)).toMatchObject({ unitsOverride: null, semesterOverride: null });
    expect(await link(ids.programmeB, ids.other)).toMatchObject({ levelOverride: 400, sourceReference: "Package file 09 (B14)" });

    // One Registry record, two programmes, two unit counts.
    expect(await prisma.masterCourse.count({ where: { code: "ZPV 201" } })).toBe(1);
    const row = (id: string) => prisma.course.findUniqueOrThrow({ where: { id }, select: { units: true, semester: true, level: true } });
    expect(await row("zpv-row-a")).toEqual({ units: 2, semester: 2, level: 200 });
    expect(await row("zpv-row-b")).toEqual({ units: 3, semester: 1, level: 200 });
    expect(await row("zpv-row-gst")).toEqual({ units: 2, semester: 2, level: 400 });
    expect(await row("zpv-row-b-305")).toEqual({ units: 2, semester: 1, level: 500 });
    expect(await row("zpv-row-archived")).toEqual({ units: 3, semester: 1, level: 200 });

    const log = await prisma.activityLog.findFirst({ where: { actorId, action: "PROGRAMME_VALUES_LOADED" } });
    expect(log?.description).toContain("Loaded 4 programme-specific course values");
  });

  it("does nothing the second time", async () => {
    const plan = await planProgrammeValuesFromDatabase(prisma, file);
    expect(plan.changes).toEqual([]);
    expect(plan.alreadySet).toBe(4);
  });

  it("keeps a programme's own value when the Registry changes the course", async () => {
    await prisma.masterCourse.update({ where: { id: ids.course }, data: { units: 4, semester: 1 } });
    await propagateMasterCourseChanges({ id: ids.course, units: 4, semester: 1, title: "Shared values" });
    const row = (id: string) => prisma.course.findUniqueOrThrow({ where: { id }, select: { units: true, semester: true } });
    expect(await row("zpv-row-a")).toEqual({ units: 2, semester: 2 });
    expect(await row("zpv-row-b")).toEqual({ units: 4, semester: 1 });
  });

  it("counts the programme's units and level in the Registry completeness report", async () => {
    const report = await loadCompletenessReport();
    const programmeA = report.programmes.find((programme) => programme.code === "ZPV-A");
    const programmeB = report.programmes.find((programme) => programme.code === "ZPV-B");
    // ZPV 201 is 2 units in A (its own value) and 4 in B (the Registry's), BU-GST 440 2 in A.
    expect(programmeA?.totalCredits).toBe(4);
    expect(programmeB?.totalCredits).toBe(6);
    expect(report.semesters.some((row) => row.programmeCode === "ZPV-B" && row.level === 400)).toBe(true);
  });
});
