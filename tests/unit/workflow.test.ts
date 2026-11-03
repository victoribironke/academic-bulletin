import { describe, expect, it } from "vitest";
import {
  canEditSubmissionAtStage,
  getAllowedWorkflowActions,
  resolveWorkflowTransition,
} from "@/lib/submissions/workflow";

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
