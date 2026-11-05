import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHASE_OWNERS,
  canEditSubmissionAtStage,
  clearedPreviousGate,
  getAllowedWorkflowActions,
  resolveWorkflowTransition,
  type PhaseOwnerRule,
} from "@/lib/submissions/workflow";

describe("phase owners as data", () => {
  // Senate (Phase 6) handed to a named secretary instead of Academic Planning.
  const owners: PhaseOwnerRule[] = [
    ...DEFAULT_PHASE_OWNERS.filter((owner) => owner.phase !== 6),
    { phase: 6, role: null, userId: "senate-secretary" },
  ];

  it("lets only the configured owner act at a reassigned phase", () => {
    const state = { currentPhase: 6, currentStatus: "IN_REVIEW" as const, owners };
    expect(getAllowedWorkflowActions({ ...state, role: "ADMIN", userId: "admin-1" })).toEqual([]);
    expect(
      getAllowedWorkflowActions({ ...state, role: "DEAN", userId: "senate-secretary" }),
    ).toEqual(["APPROVE", "RETURN", "REJECT"]);
    expect(
      canEditSubmissionAtStage({
        ...state,
        currentStatus: "CORRECTIONS_REQUIRED",
        role: "DEAN",
        userId: "senate-secretary",
      }),
    ).toBe(true);
    // Other phases keep their owners, and Super Admin stays the recovery override.
    expect(
      getAllowedWorkflowActions({ ...state, currentPhase: 7, role: "ADMIN", userId: "admin-1" }),
    ).toEqual(["APPROVE", "RETURN", "REJECT"]);
    expect(getAllowedWorkflowActions({ ...state, role: "SUPER_ADMIN", userId: "super" })).toEqual([
      "APPROVE",
      "RETURN",
      "REJECT",
    ]);
  });

  it("starts with today's owners: department, Dean, then Academic Planning", () => {
    expect(DEFAULT_PHASE_OWNERS.filter((owner) => owner.phase <= 2)).toEqual([
      { phase: 1, role: "HOD", userId: null },
      { phase: 1, role: "PROGRAMME_COORDINATOR", userId: null },
      { phase: 2, role: "DEAN", userId: null },
    ]);
    expect(
      DEFAULT_PHASE_OWNERS.filter((owner) => owner.phase >= 3).map((owner) => owner.role),
    ).toEqual(Array(8).fill("ADMIN"));
  });

  it("stops the person who moved a bulletin into a phase from clearing it", () => {
    expect(clearedPreviousGate("APPROVE", "admin-1", "admin-1")).toBe(true);
    expect(clearedPreviousGate("SUBMIT", "admin-1", "admin-1")).toBe(true);
    expect(clearedPreviousGate("APPROVE", "admin-2", "admin-1")).toBe(false);
    // Sending work back is never blocked, and nothing blocks the first gate.
    expect(clearedPreviousGate("RETURN", "admin-1", "admin-1")).toBe(false);
    expect(clearedPreviousGate("REJECT", "admin-1", "admin-1")).toBe(false);
    expect(clearedPreviousGate("SUBMIT", "hod-1", null)).toBe(false);
  });
});

describe("submission workflow", () => {
  it("submits drafts and corrected submissions for review", () => {
    expect(
      resolveWorkflowTransition({
        action: "SUBMIT",
        currentPhase: 1,
        currentStatus: "DRAFT",
      }),
    ).toEqual({ ok: true, phase: 2, status: "IN_REVIEW" });

    expect(
      resolveWorkflowTransition({
        action: "SUBMIT",
        currentPhase: 4,
        currentStatus: "CORRECTIONS_REQUIRED",
      }),
    ).toEqual({ ok: true, phase: 5, status: "IN_REVIEW" });
  });

  it("assigns the first three hand-offs to Department, School, then Academic Planning", () => {
    expect(
      getAllowedWorkflowActions({
        role: "HOD",
        currentPhase: 1,
        currentStatus: "DRAFT",
      }),
    ).toEqual(["SUBMIT"]);
    expect(
      getAllowedWorkflowActions({
        role: "DEAN",
        currentPhase: 2,
        currentStatus: "IN_REVIEW",
      }),
    ).toEqual(["APPROVE", "RETURN"]);
    expect(
      getAllowedWorkflowActions({
        role: "ADMIN",
        currentPhase: 3,
        currentStatus: "IN_REVIEW",
      }),
    ).toEqual(["APPROVE", "RETURN", "REJECT"]);
  });

  it("does not expose another stage's actions to a role", () => {
    expect(
      getAllowedWorkflowActions({
        role: "ADMIN",
        currentPhase: 2,
        currentStatus: "IN_REVIEW",
      }),
    ).toEqual([]);
    expect(
      getAllowedWorkflowActions({
        role: "DEAN",
        currentPhase: 3,
        currentStatus: "IN_REVIEW",
      }),
    ).toEqual([]);
    expect(
      getAllowedWorkflowActions({
        role: "HOD",
        currentPhase: 2,
        currentStatus: "IN_REVIEW",
      }),
    ).toEqual([]);
  });

  it("assigns correction editing and resubmission to the owner of that stage", () => {
    expect(
      canEditSubmissionAtStage({
        role: "HOD",
        currentPhase: 1,
        currentStatus: "CORRECTIONS_REQUIRED",
      }),
    ).toBe(true);
    expect(
      canEditSubmissionAtStage({
        role: "DEAN",
        currentPhase: 2,
        currentStatus: "CORRECTIONS_REQUIRED",
      }),
    ).toBe(true);
    expect(
      canEditSubmissionAtStage({
        role: "ADMIN",
        currentPhase: 3,
        currentStatus: "CORRECTIONS_REQUIRED",
      }),
    ).toBe(true);
    expect(
      canEditSubmissionAtStage({
        role: "HOD",
        currentPhase: 2,
        currentStatus: "CORRECTIONS_REQUIRED",
      }),
    ).toBe(false);
  });

  it("moves returned and rejected work into corrections required", () => {
    expect(
      resolveWorkflowTransition({
        action: "RETURN",
        currentPhase: 4,
        currentStatus: "IN_REVIEW",
        remarks: "Update the course outcomes",
      }),
    ).toEqual({ ok: true, phase: 3, status: "CORRECTIONS_REQUIRED" });

    expect(
      resolveWorkflowTransition({
        action: "REJECT",
        currentPhase: 4,
        currentStatus: "IN_REVIEW",
        remarks: "Major corrections required",
      }),
    ).toEqual({ ok: true, phase: 1, status: "CORRECTIONS_REQUIRED" });
  });

  it("requires feedback and rejects invalid state changes", () => {
    expect(
      resolveWorkflowTransition({
        action: "RETURN",
        currentPhase: 2,
        currentStatus: "IN_REVIEW",
      }),
    ).toMatchObject({ ok: false, statusCode: 400 });

    expect(
      resolveWorkflowTransition({
        action: "APPROVE",
        currentPhase: 1,
        currentStatus: "DRAFT",
      }),
    ).toMatchObject({ ok: false, statusCode: 409 });
  });

  it("bounds phases and marks the final approval", () => {
    expect(
      resolveWorkflowTransition({
        action: "APPROVE",
        currentPhase: 9,
        currentStatus: "IN_REVIEW",
      }),
    ).toEqual({ ok: true, phase: 10, status: "APPROVED" });

    expect(
      resolveWorkflowTransition({
        action: "APPROVE",
        currentPhase: 99,
        currentStatus: "IN_REVIEW",
      }),
    ).toMatchObject({ ok: false, statusCode: 409 });
  });
});
