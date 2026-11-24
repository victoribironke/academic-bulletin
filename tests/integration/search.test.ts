import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "@/lib/prisma";
import { searchEverything } from "@/lib/search/query";
import { refreshIfStale, refreshSearchIndex, resetRefreshClock } from "@/lib/search/sync";

// Tasks K1 to K4, K6 on a real database: the search table, forgiving
// matching, grouping and the 150 ms target. Uses its own codes (ZSE...).
describe("search (K1 to K4, K6)", () => {
  const ids = { school: "zse-school", department: "zse-department", programme: "zse-programme", staff: "zse-staff" };

  beforeAll(async () => {
    const sql = readFileSync("prisma/migrations/20261124160000_search_documents/migration.sql", "utf8");
    for (const statement of sql.split("\n").filter((line) => !line.startsWith("--")).join("\n").split(";").map((part) => part.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
    await prisma.school.create({ data: { id: ids.school, code: "ZNEW", name: "School of Search Tests" } });
    await prisma.codeAlias.create({ data: { kind: "SCHOOL", oldCode: "ZOLD", newCode: "ZNEW", entityId: ids.school, validUntil: new Date("2030-01-01") } });
    await prisma.department.create({ data: { id: ids.department, code: "ZNEW-DEP", name: "Department of Finding Things", schoolId: ids.school } });
    await prisma.programme.create({ data: { id: ids.programme, code: "ZNEW-DEP-FIN", name: "Findability Studies", degreeType: "B.Sc.", duration: 4, departmentId: ids.department } });
    await prisma.masterCourse.createMany({
      data: [
        { id: "zse-101", code: "ZSE 101", title: "Introduction to Search", units: 2, level: 100, semester: 1, ownerDeptId: ids.department, courseContent: "Indexes, ranking and typing mistakes." },
        { id: "zse-102", code: "ZSE 102", title: "Search in Practice", units: 2, level: 100, semester: 2, ownerDeptId: ids.department },
        { id: "zse-bu125", code: "BU-ZSE 125", title: "Babcock Search Seminar", units: 1, level: 100, semester: 1, ownerDeptId: ids.department },
        { id: "zse-gst", code: "GST 199", title: "Communication Sample", units: 2, level: 100, semester: 1, ownership: "INSTITUTIONAL", type: "GST_NUC" },
        { id: "zse-yor", code: "ZSE 304", title: "Introduction to Yorùbá Drama", units: 2, level: 300, semester: 1, ownerDeptId: ids.department },
      ],
    });
    await prisma.staff.create({
      data: { id: ids.staff, departmentId: ids.department, title: "DR", gender: "FEMALE", surname: "Okonkwo-Search", firstName: "Ada", highestQualification: "PHD", academicRank: "LECTURER_I", type: "ACADEMIC", specialization: "Information retrieval" },
    });
    await refreshSearchIndex({ full: true });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM search_documents WHERE entity_id LIKE 'zse-%' OR entity_id LIKE 'zgen-%'`);
    await prisma.masterCourse.deleteMany({ where: { OR: [{ id: { startsWith: "zse-" } }, { id: { startsWith: "zgen-" } }] } });
    await prisma.staff.deleteMany({ where: { id: ids.staff } });
    await prisma.programme.deleteMany({ where: { id: ids.programme } });
    await prisma.department.deleteMany({ where: { id: ids.department } });
    await prisma.codeAlias.deleteMany({ where: { oldCode: "ZOLD" } });
    await prisma.school.deleteMany({ where: { id: ids.school } });
    // The table isn't in the Prisma schema (its tsvector column), so the next
    // test run's schema push would refuse to start with it there.
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "search_documents"');
  });

  const first = async (query: string, type?: string) => {
    const { groups } = await searchEverything("HOD", query);
    return (type ? groups.find((group) => group.type === type) : groups[0])?.results[0];
  };

  it("puts an exact course code first, however it is typed", async () => {
    for (const typed of ["zse101", "ZSE-101", "zse 101"]) {
      const { groups } = await searchEverything("HOD", typed);
      expect(groups[0].type).toBe("course");
      expect(groups[0].results[0]).toMatchObject({ code: "ZSE 101", url: "/master-courses?q=ZSE%20101" });
    }
    expect((await first("bu zse 125"))?.code).toBe("BU-ZSE 125");
    // Codes that start with what was typed come next.
    const { groups } = await searchEverything("HOD", "ZSE 1");
    expect(groups[0].results.slice(0, 2).map((result) => result.code).sort()).toEqual(["ZSE 101", "ZSE 102"]);
  });

  it("forgives typing mistakes and accents, and expands synonyms", async () => {
    expect((await first("introdution to serch", "course"))?.title).toBe("Introduction to Search");
    expect((await first("yoruba drama", "course"))?.title).toBe("Introduction to Yorùbá Drama");
    const general = await searchEverything("HOD", "general studies");
    expect(general.groups.find((group) => group.type === "course")?.results.map((result) => result.code)).toContain("GST 199");
  });

  it("finds units by old codes, people by name, and policy sections", async () => {
    expect(await first("ZOLD")).toMatchObject({ type: "school", title: "School of Search Tests" });
    expect(await first("findability", "programme")).toMatchObject({ code: "ZNEW-DEP-FIN" });
    expect(await first("okonkwo", "person")).toMatchObject({ title: expect.stringMatching(/okonkwo-search/i), url: "/staff?q=Okonkwo-Search" });
    // The policy section titled "Academic Load" beats text that only mentions both words.
    const load = await searchEverything("HOD", "academic load");
    expect(load.groups[0]).toMatchObject({ type: "policySection" });
    expect(load.groups[0].results[0]).toMatchObject({ url: "/policy#academic-load" });
  });

  it("keeps up with saves and deletions", async () => {
    await prisma.masterCourse.update({ where: { id: "zse-102" }, data: { title: "Retrieval in Practice" } });
    await prisma.masterCourse.delete({ where: { id: "zse-bu125" } });
    resetRefreshClock();
    await refreshIfStale();
    expect((await first("zse 102"))?.title).toBe("Retrieval in Practice");
    expect((await first("bu zse 125"))?.code).not.toBe("BU-ZSE 125");
  });

  it("answers 95 of 100 searches in under 150 ms", async () => {
    // Some bulk, as the Registry has (6,500 courses on the test site).
    await prisma.masterCourse.createMany({
      data: Array.from({ length: 5000 }, (_, index) => ({
        id: `zgen-${index}`,
        code: `Z${String.fromCharCode(65 + (index % 26))}${String.fromCharCode(65 + Math.floor(index / 26) % 26)} ${100 + (index % 500)}`,
        title: `Generated course ${index} on ${["economics", "law", "nursing", "physics", "history"][index % 5]}`,
        units: 2,
        level: 100 * (1 + (index % 4)),
        semester: 1,
      })),
      skipDuplicates: true,
    });
    await refreshSearchIndex({ full: true });
    const queries = ["eco101", "ZSE 101", "introduction", "nursing", "generated course 42", "law", "bu zse 125", "physics 3", "general studies", "okonkwo"];
    const times: number[] = [];
    for (let round = 0; round < 10; round += 1) {
      for (const query of queries) times.push((await searchEverything("HOD", query)).tookMs);
    }
    times.sort((a, b) => a - b);
    expect(times[94]).toBeLessThan(150);
  });
});
