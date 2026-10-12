import { describe, expect, it } from "vitest";
import { resolveWorkflowTransition } from "@/lib/submissions/workflow";

describe("submission workflow", () => {
  it("submits drafts and corrected submissions for review", () => {
    expect(
      resolveWorkflowTransition({
        action: "SUBMIT",
        currentPhase: 1,
        currentStatus: "DRAFT",
      }),
    ).toEqual({ ok: true, phase: 1, status: "IN_REVIEW" });

    expect(
      resolveWorkflowTransition({
        action: "SUBMIT",
        currentPhase: 4,
        currentStatus: "CORRECTIONS_REQUIRED",
      }),
    ).toEqual({ ok: true, phase: 1, status: "IN_REVIEW" });
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
        currentPhase: 10,
        currentStatus: "IN_REVIEW",
      }),
    ).toEqual({ ok: true, phase: 11, status: "APPROVED" });

    expect(
      resolveWorkflowTransition({
        action: "APPROVE",
        currentPhase: 99,
        currentStatus: "IN_REVIEW",
      }),
    ).toMatchObject({ ok: false, statusCode: 409 });
  });
});
