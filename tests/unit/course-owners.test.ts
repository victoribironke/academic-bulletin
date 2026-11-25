import { describe, expect, it } from "vitest";
import { coursePrefix, courseOwnersReport, planCourseOwners, type OwnerPlanCourse } from "@/lib/courses/course-owners";

// Task B6: filling in course owners, planned without a database.

const departments = [
  { id: "d-bas", code: "SSAT-BAS", name: "Department of Basic Sciences" },
  { id: "d-mcm", code: "VSSS-MCM", name: "Department of Mass Communication" },
  { id: "d-ait", code: "SSAT-AIT", name: "Department of Agriculture and Industrial Technology" },
  { id: "d-irm", code: "SMSC-IRM", name: "Department of Information Resources Management" },
  { id: "d-pbh", code: "SAHS-PBH", name: "Department of Public Health" },
];
const schools = [{ id: "s-smsc", code: "SMSC", name: "School of Management Sciences" }];

const course = (code: string, owner: string | null = null, users: string[] = [], school: string | null = null): OwnerPlanCourse => ({
  id: `c-${code}`,
  code,
  title: `${code} title`,
  ownerDeptId: owner,
  ownerSchoolId: school,
  programmeDepartmentIds: users,
});

const owned = (prefix: string, owner: string, count: number) =>
  Array.from({ length: count }, (_, index) => course(`${prefix} ${101 + index}`, owner, [owner]));

describe("coursePrefix", () => {
  it("reads the prefix however the code is written", () => {
    expect(coursePrefix("ANS 201")).toBe("ANS");
    expect(coursePrefix("BU-ANS 201")).toBe("ANS");
    expect(coursePrefix("CHM107")).toBe("CHM");
    expect(coursePrefix("irma 304")).toBe("IRMA");
  });
});

describe("planCourseOwners", () => {
  it("uses the work order's defaults first", () => {
    const plan = planCourseOwners({
      courses: [course("PHY 201", null, ["d-pbh"]), course("AMS 101", null, ["d-irm"])],
      departments,
      schools,
    });
    expect(plan.changes.map((change) => [change.code, change.owner.code, change.owner.kind, change.rule])).toEqual([
      ["AMS 101", "SMSC", "SCHOOL", "WORK_ORDER"],
      ["PHY 201", "SSAT-BAS", "DEPARTMENT", "WORK_ORDER"],
    ]);
  });

  it("then the owner of the same prefix, then the one department that uses it", () => {
    const plan = planCourseOwners({
      courses: [
        ...owned("ANS", "d-ait", 4),
        course("ANS 399", null, []),
        course("BU-ANS 410", null, ["d-ait"]),
        course("IRMA 304", null, ["d-irm"]),
      ],
      departments,
      schools,
    });
    expect(plan.changes.map((change) => [change.code, change.owner.code, change.rule])).toEqual([
      ["ANS 399", "SSAT-AIT", "SAME_PREFIX"],
      ["BU-ANS 410", "SSAT-AIT", "SAME_PREFIX"],
      ["IRMA 304", "SMSC-IRM", "PROGRAMMES"],
    ]);
    expect(plan.changes[0].why).toBe("Department of Agriculture and Industrial Technology owns 4 of the 4 other ANS courses.");
  });

  it("leaves a course to DAP when the prefix and the programmes disagree", () => {
    const plan = planCourseOwners({
      courses: [...owned("MCM", "d-mcm", 5), course("MCM 221", null, ["d-bas"])],
      departments,
      schools,
    });
    expect(plan.changes).toEqual([]);
    expect(plan.gaps.map((gap) => gap.code)).toEqual(["MCM 221"]);
    expect(plan.gaps[0].why).toContain("only Department of Basic Sciences's programmes use it");
  });

  it("leaves a course used across departments with no clear prefix owner to DAP", () => {
    const plan = planCourseOwners({
      courses: [course("XYZ 101", null, ["d-bas", "d-pbh"])],
      departments,
      schools,
    });
    expect(plan.gaps.map((gap) => [gap.code, gap.why])).toEqual([
      ["XYZ 101", "Programmes in 2 departments use it (SAHS-PBH, SSAT-BAS)."],
    ]);
  });

  it("never changes an owner, and leaves General Education to its desk (DEC8)", () => {
    const plan = planCourseOwners({
      courses: [course("PHY 101", "d-pbh", ["d-pbh"]), course("BU-GST 105"), course("ENT 322"), course("GST 111")],
      departments,
      schools,
    });
    expect(plan.changes).toEqual([]);
    expect(plan.gaps).toEqual([]);
    expect(plan.counts).toEqual({ offered: 4, generalEducation: 3, owned: 1, toFill: 0, gaps: 0 });
  });

  it("writes a report DAP can read", () => {
    const plan = planCourseOwners({ courses: [course("PHY 201"), course("XYZ 101")], departments, schools });
    const report = courseOwnersReport(plan, "Course owners (B6): dry run");
    expect(report).toContain("| PHY 201 PHY 201 title | SSAT-BAS Department of Basic Sciences | work order default |");
    expect(report).toContain("## Left for DAP (1)");
  });
});
