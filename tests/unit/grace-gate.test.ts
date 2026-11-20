import { describe, expect, it } from "vitest";
import type { CourseGraceBlockers } from "@/lib/courses/grace-compliance";
import { GRACE_OVERRIDE_REASON_LENGTH, GRACE_OVERRIDE_ROLES } from "@/lib/grace-config";
import {
  PHILOSOPHY_GRACE_MESSAGE,
  buildGraceGate,
  canOverrideGrace,
  decideGraceApproval,
  readGraceOverride,
  summarizeGraceGate,
} from "@/lib/submissions/grace-gate";
import { philosophyGraceHash } from "@/lib/submissions/submit-readiness";

const noBlockers = (): CourseGraceBlockers => ({
  missing: [],
  pending: [],
  checking: [],
  needsRevision: [],
  error: [],
  changed: [],
});

const philosophy = Array.from({ length: 160 }, (_, i) => `word${i}`).join(" ");
const passingContent = {
  philosophy,
  philosophyGracePass: true,
  philosophyGrace: { passed: true, contentHash: philosophyGraceHash(philosophy) },
  minimumDuration: "4 years",
  minimumCGPA: 2.5,
  totalUnits: 120,
};

const reason = "Senate asked for this bulletin before the rerun finishes.";

describe("GRACE gate on approvals", () => {
  it("lets a bulletin through when every result has passed", () => {
    const gate = buildGraceGate(noBlockers(), passingContent);
    expect(gate).toMatchObject({ blocked: false, philosophy: false, issues: [] });
    expect(decideGraceApproval({ role: "DEAN", gate, override: null })).toEqual({
      ok: true,
      override: null,
    });
    // An override sent without any blockers is not recorded.
    expect(
      decideGraceApproval({ role: "SUPER_ADMIN", gate, override: { reason } }),
    ).toEqual({ ok: true, override: null });
  });

  it("blocks failing, waiting, missing and out-of-date course results", () => {
    for (const state of Object.keys(noBlockers()) as (keyof CourseGraceBlockers)[]) {
      const courses = { ...noBlockers(), [state]: ["ABC 101"] };
      const gate = buildGraceGate(courses, passingContent);
      expect(gate.blocked).toBe(true);
      expect(gate.issues.join(" ")).toContain("ABC 101");
      expect(decideGraceApproval({ role: "DEAN", gate, override: null })).toMatchObject({
        ok: false,
        status: 409,
        code: "GRACE_APPROVAL_BLOCKED",
      });
    }
  });

  it("blocks a philosophy whose pass was for different words", () => {
    const changed = { ...passingContent, philosophy: `${philosophy} more` };
    const gate = buildGraceGate(noBlockers(), changed);
    expect(gate).toMatchObject({ blocked: true, philosophy: true });
    expect(gate.issues).toEqual([PHILOSOPHY_GRACE_MESSAGE]);

    const failed = { ...passingContent, philosophyGracePass: false };
    expect(buildGraceGate(noBlockers(), failed).blocked).toBe(true);
  });

  it("refuses an override from a role that may not override", () => {
    const gate = buildGraceGate({ ...noBlockers(), needsRevision: ["ABC 101"] }, passingContent);
    for (const role of ["DEAN", "ADMIN", "HOD", "PROGRAMME_COORDINATOR"] as const) {
      expect(canOverrideGrace(role)).toBe(false);
      expect(decideGraceApproval({ role, gate, override: { reason } })).toMatchObject({
        ok: false,
        status: 403,
        code: "GRACE_OVERRIDE_NOT_ALLOWED",
      });
    }
  });

  it("needs a reason of the right length, even from Super Admin", () => {
    expect(GRACE_OVERRIDE_ROLES).toEqual(["SUPER_ADMIN"]);
    const gate = buildGraceGate({ ...noBlockers(), needsRevision: ["ABC 101"] }, passingContent);
    const { min, max } = GRACE_OVERRIDE_REASON_LENGTH;
    for (const text of ["", "too short", "x".repeat(min - 1), "x".repeat(max + 1)]) {
      expect(
        decideGraceApproval({ role: "SUPER_ADMIN", gate, override: { reason: text } }),
      ).toMatchObject({ ok: false, status: 400, code: "GRACE_OVERRIDE_REASON_REQUIRED" });
    }
  });

  it("records the reason and exactly what the override covered", () => {
    const gate = buildGraceGate(
      { ...noBlockers(), needsRevision: ["ABC 101"], changed: ["XYZ 202"] },
      { ...passingContent, philosophyGracePass: false },
    );
    const decision = decideGraceApproval({ role: "SUPER_ADMIN", gate, override: { reason } });
    expect(decision).toEqual({
      ok: true,
      override: {
        reason,
        courses: { needsRevision: ["ABC 101"], changed: ["XYZ 202"] },
        philosophy: true,
        issues: gate.issues,
      },
    });
  });

  it("reads only a reason from the request, trimmed", () => {
    expect(readGraceOverride({})).toBeNull();
    expect(readGraceOverride(null)).toBeNull();
    expect(readGraceOverride({ graceOverride: "yes" })).toBeNull();
    expect(readGraceOverride({ graceOverride: { reason: `  ${reason}  ` } })).toEqual({
      reason,
    });
    expect(readGraceOverride({ graceOverride: { reason: 42 } })).toEqual({ reason: "" });
  });

  it("tells the page who may override", () => {
    const blocked = buildGraceGate({ ...noBlockers(), error: ["ABC 101"] }, passingContent);
    expect(summarizeGraceGate(blocked, "SUPER_ADMIN")).toMatchObject({
      blocked: true,
      canOverride: true,
    });
    expect(summarizeGraceGate(blocked, "DEAN")).toMatchObject({
      blocked: true,
      canOverride: false,
    });
    const clear = buildGraceGate(noBlockers(), passingContent);
    expect(summarizeGraceGate(clear, "SUPER_ADMIN").canOverride).toBe(false);
  });
});
