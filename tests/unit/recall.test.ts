import { describe, expect, it } from "vitest";
import { getAllowedWorkflowActions, resolveWorkflowTransition } from "@/lib/submissions/workflow";

// Task D5: recall, kept apart from Return.

describe("recalling a submitted programme (D5)", () => {
  it("is offered to the department while the programme waits at School Board Harmonisation", () => {
    expect(getAllowedWorkflowActions({ role: "HOD", currentPhase: 2, currentStatus: "IN_REVIEW" })).toEqual(["RECALL"]);
    expect(getAllowedWorkflowActions({ role: "PROGRAMME_COORDINATOR", currentPhase: 2, currentStatus: "IN_REVIEW" })).toEqual([
      "RECALL",
    ]);
    // The Dean keeps their own actions; nobody recalls from later phases.
    expect(getAllowedWorkflowActions({ role: "DEAN", currentPhase: 2, currentStatus: "IN_REVIEW" })).toEqual(["APPROVE", "RETURN"]);
    expect(getAllowedWorkflowActions({ role: "HOD", currentPhase: 3, currentStatus: "IN_REVIEW" })).toEqual([]);
    expect(getAllowedWorkflowActions({ role: "HOD", currentPhase: 2, currentStatus: "CORRECTIONS_REQUIRED" })).toEqual([]);
  });

  it("puts it back to Draft, never Revision requested", () => {
    expect(resolveWorkflowTransition({ action: "RECALL", currentPhase: 2, currentStatus: "IN_REVIEW" })).toEqual({
      ok: true,
      phase: 1,
      status: "DRAFT",
    });
    expect(resolveWorkflowTransition({ action: "RECALL", currentPhase: 3, currentStatus: "IN_REVIEW" })).toMatchObject({
      ok: false,
      statusCode: 409,
    });
  });
});
