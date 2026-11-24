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
