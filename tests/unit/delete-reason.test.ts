import { describe, expect, it } from "vitest";
import { cleanDeleteReason, deleteNeedsReason, deleteReasonProblem } from "@/lib/delete-reason";

// Work order Q7, Appendix D: deleting something another unit owns asks why.
describe("a reason for deleting another unit's row", () => {
  it("is needed from everyone but the department's own Head and coordinators", () => {
    expect(deleteNeedsReason({ role: "HOD", departmentId: "d1" }, "d1")).toBe(false);
    expect(deleteNeedsReason({ role: "PROGRAMME_COORDINATOR", departmentId: "d1" }, "d1")).toBe(false);
    expect(deleteNeedsReason({ role: "HOD", departmentId: "d2" }, "d1")).toBe(true);
    for (const role of ["ADMIN", "SUPER_ADMIN", "DEAN", "LECTURER"]) {
      expect(deleteNeedsReason({ role, departmentId: "d1" }, "d1")).toBe(true);
    }
  });

  it("is at least 10 characters once tidied, and under 500", () => {
    expect(deleteReasonProblem(undefined)).toMatch(/at least 10 characters/);
    expect(deleteReasonProblem("   too   short  ")).toMatch(/at least 10 characters/);
    expect(deleteReasonProblem("Duplicate row, agreed with the Head.")).toBeNull();
    expect(deleteReasonProblem("x".repeat(501))).toMatch(/under 500/);
    expect(cleanDeleteReason("  two   spaces ")).toBe("two spaces");
    expect(cleanDeleteReason("   ")).toBeNull();
    expect(cleanDeleteReason(42)).toBeNull();
  });
});

import { changeRequestProblem, courseListFingerprint, isNotSwitchedOn } from "@/lib/courses/course-list";

describe("course list confirmation (B10)", () => {
  it("notices any change to codes, units, semesters, levels or core and elective, but not the order", () => {
    const rows = [
      { code: "ECO 101", units: 2, semester: 1, level: 100, status: "CORE" },
      { code: "ECO 102", units: 2, semester: 2, level: 100, status: "CORE" },
    ];
    expect(courseListFingerprint(rows)).toBe(courseListFingerprint([...rows].reverse()));
    expect(courseListFingerprint(rows)).not.toBe(courseListFingerprint([{ ...rows[0], units: 3 }, rows[1]]));
    expect(courseListFingerprint(rows)).not.toBe(courseListFingerprint([rows[0], { ...rows[1], semester: null }]));
  });

  it("checks a change request before it goes to DAP", () => {
    expect(changeRequestProblem({ kind: "MOVE", details: "Somewhere else entirely" })).toMatch(/what should change/);
    expect(changeRequestProblem({ kind: "REMOVE", details: "Not taught any more." })).toMatch(/which course/);
    expect(changeRequestProblem({ kind: "ADD", details: "Add a course on data ethics." })).toBeNull();
  });

  it("treats a missing table as not switched on yet", () => {
    expect(isNotSwitchedOn({ code: "P2021" })).toBe(true);
    expect(isNotSwitchedOn(new Error("other"))).toBe(false);
  });
});
