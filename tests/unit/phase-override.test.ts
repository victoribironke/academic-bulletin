import { describe, expect, it } from "vitest";
import {
  canOverridePhase,
  getWorkflowAccess,
  readOverrideReason,
} from "@/lib/submissions/workflow";

// Task D4 and Appendix B: who may act outside their own phase, and how.

describe("phase overrides (D4)", () => {
  it("lets only a Super Administrator, or an admin at School Board Harmonisation, override", () => {
    for (let phase = 1; phase <= 10; phase += 1) expect(canOverridePhase("SUPER_ADMIN", phase)).toBe(true);
    expect(canOverridePhase("ADMIN", 2)).toBe(true);
    expect(canOverridePhase("ADMIN", 1)).toBe(false);
    for (const role of ["HOD", "DEAN", "PROGRAMME_COORDINATOR"] as const) {
      for (let phase = 1; phase <= 10; phase += 1) expect(canOverridePhase(role, phase)).toBe(false);
    }
  });

  it("marks access through an override, and none for the owner", () => {
    expect(getWorkflowAccess({ role: "HOD", currentPhase: 1, currentStatus: "DRAFT" })).toEqual({
      actions: ["SUBMIT"],
      viaOverride: false,
    });
    expect(getWorkflowAccess({ role: "SUPER_ADMIN", currentPhase: 1, currentStatus: "DRAFT" })).toEqual({
      actions: ["SUBMIT"],
      viaOverride: true,
    });
    expect(getWorkflowAccess({ role: "ADMIN", currentPhase: 2, currentStatus: "IN_REVIEW" })).toEqual({
      actions: ["APPROVE", "RETURN"],
      viaOverride: true,
    });
    expect(getWorkflowAccess({ role: "ADMIN", currentPhase: 3, currentStatus: "IN_REVIEW" }).viaOverride).toBe(false);
    expect(getWorkflowAccess({ role: "HOD", currentPhase: 2, currentStatus: "IN_REVIEW" }).actions).toEqual([]);
    expect(getWorkflowAccess({ role: "DEAN", currentPhase: 3, currentStatus: "IN_REVIEW" }).actions).toEqual([]);
  });

  it("needs a reason of 20 to 500 characters, as text or { reason }", () => {
    expect(readOverrideReason(undefined)).toMatchObject({ ok: false });
    expect(readOverrideReason("Head is unavailable")).toMatchObject({ ok: false }); // 19
    expect(readOverrideReason("   Head is unavailable today   ")).toEqual({ ok: true, reason: "Head is unavailable today" });
    expect(readOverrideReason({ reason: "The Dean is on leave until January." })).toMatchObject({ ok: true });
    expect(readOverrideReason("x".repeat(501))).toMatchObject({ ok: false });
  });
});
