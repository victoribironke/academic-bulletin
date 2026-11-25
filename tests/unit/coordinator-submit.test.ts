import { describe, expect, it } from "vitest";
import { canEditSubmissionAtStage, getAllowedWorkflowActions } from "@/lib/submissions/workflow";
import { quickStartFor } from "@/lib/help/quick-start";

// Task G2: a programme coordinator drafts the whole programme; only the Head
// of Department submits or recalls it.

describe("programme coordinators (G2)", () => {
  it("edit the draft but never submit or recall it", () => {
    for (const currentStatus of ["DRAFT", "CORRECTIONS_REQUIRED"] as const) {
      expect(canEditSubmissionAtStage({ role: "PROGRAMME_COORDINATOR", currentPhase: 1, currentStatus })).toBe(true);
      expect(getAllowedWorkflowActions({ role: "PROGRAMME_COORDINATOR", currentPhase: 1, currentStatus })).toEqual([]);
      expect(getAllowedWorkflowActions({ role: "HOD", currentPhase: 1, currentStatus })).toEqual(["SUBMIT"]);
    }
    expect(getAllowedWorkflowActions({ role: "PROGRAMME_COORDINATOR", currentPhase: 2, currentStatus: "IN_REVIEW" })).toEqual([]);
    expect(getAllowedWorkflowActions({ role: "HOD", currentPhase: 2, currentStatus: "IN_REVIEW" })).toEqual(["RECALL"]);
  });

  it("are told to hand over to their Head, and Heads are told they can name them", () => {
    const coordinator = quickStartFor("PROGRAMME_COORDINATOR").steps.join(" ");
    expect(coordinator).toContain("only the Head submits the programme");
    expect(coordinator).not.toContain("use **Submit to School**");
    expect(quickStartFor("HOD").steps.join(" ")).toContain("name a **programme coordinator**");
  });
});
