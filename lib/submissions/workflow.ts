import type { SubmissionStatus } from "@prisma/client";
import { TOTAL_PHASES } from "@/lib/submissions/phases";

export type SubmissionAction = "SUBMIT" | "APPROVE" | "REJECT" | "RETURN";

export type WorkflowTransition =
  | { ok: true; phase: number; status: SubmissionStatus }
  | { ok: false; statusCode: 400 | 409; message: string };

export function resolveWorkflowTransition(input: {
  action: string;
  currentPhase: number;
  currentStatus: SubmissionStatus;
  remarks?: string | null;
}): WorkflowTransition {
  const { action, currentPhase, currentStatus, remarks } = input;

  if (
    !Number.isInteger(currentPhase) ||
    currentPhase < 1 ||
    currentPhase > TOTAL_PHASES
  ) {
    return { ok: false, statusCode: 409, message: "Invalid current phase." };
  }

  if (action === "SUBMIT") {
    if (!["DRAFT", "CORRECTIONS_REQUIRED"].includes(currentStatus)) {
      return {
        ok: false,
        statusCode: 409,
        message:
          "Only drafts or submissions requiring corrections can be submitted.",
      };
    }
    return { ok: true, phase: 1, status: "IN_REVIEW" };
  }

  if (!["APPROVE", "REJECT", "RETURN"].includes(action)) {
    return {
      ok: false,
      statusCode: 400,
      message: "Invalid action. Use APPROVE, REJECT, RETURN, or SUBMIT.",
    };
  }

  if (currentStatus !== "IN_REVIEW") {
    return {
      ok: false,
      statusCode: 409,
      message: "Only submissions in review can be reviewed.",
    };
  }

  if (["REJECT", "RETURN"].includes(action) && !remarks?.trim()) {
    return {
      ok: false,
      statusCode: 400,
      message: "Correction feedback is required.",
    };
  }

  if (action === "APPROVE") {
    const phase = Math.min(currentPhase + 1, TOTAL_PHASES);
    return {
      ok: true,
      phase,
      status: phase === TOTAL_PHASES ? "APPROVED" : "IN_REVIEW",
    };
  }

  if (action === "REJECT") {
    return { ok: true, phase: 1, status: "CORRECTIONS_REQUIRED" };
  }

  return {
    ok: true,
    phase: Math.max(currentPhase - 1, 1),
    status: "CORRECTIONS_REQUIRED",
  };
}
