import type { SubmissionStatus, UserRole } from "@prisma/client";
import { TOTAL_PHASES } from "@/lib/submissions/phases";

export type SubmissionAction = "SUBMIT" | "APPROVE" | "REJECT" | "RETURN";

export type WorkflowTransition =
  | { ok: true; phase: number; status: SubmissionStatus }
  | { ok: false; statusCode: 400 | 409; message: string };

type WorkflowState = {
  role: UserRole;
  currentPhase: number;
  currentStatus: SubmissionStatus;
};

const DEPARTMENT_ROLES: UserRole[] = ["PROGRAMME_COORDINATOR", "HOD"];

/**
 * The role/phase hand-off matrix. Keeping it here lets the page show only the
 * actions the API will accept, while the API remains the final authority.
 */
export function getAllowedWorkflowActions({
  role,
  currentPhase,
  currentStatus,
}: WorkflowState): SubmissionAction[] {
  if (
    !Number.isInteger(currentPhase) ||
    currentPhase < 1 ||
    currentPhase > TOTAL_PHASES ||
    currentStatus === "APPROVED" ||
    currentStatus === "REJECTED"
  ) {
    return [];
  }

  if (currentStatus === "DRAFT" || currentStatus === "CORRECTIONS_REQUIRED") {
    if (role === "SUPER_ADMIN") return ["SUBMIT"];
    if (currentPhase === 1 && DEPARTMENT_ROLES.includes(role)) return ["SUBMIT"];
    if (currentPhase === 2 && role === "DEAN") return ["SUBMIT"];
    if (currentPhase >= 3 && role === "ADMIN") return ["SUBMIT"];
    return [];
  }

  if (currentStatus !== "IN_REVIEW") return [];

  if (role === "SUPER_ADMIN") {
    return currentPhase >= 3
      ? ["APPROVE", "RETURN", "REJECT"]
      : ["APPROVE", "RETURN"];
  }
  if (currentPhase === 2 && role === "DEAN") {
    return ["APPROVE", "RETURN"];
  }
  if (currentPhase >= 3 && role === "ADMIN") {
    return ["APPROVE", "RETURN", "REJECT"];
  }
  return [];
}

export function canPerformWorkflowAction(
  state: WorkflowState,
  action: string,
): action is SubmissionAction {
  return getAllowedWorkflowActions(state).includes(action as SubmissionAction);
}

/** The same stage ownership rules also govern who can edit corrections. */
export function canEditSubmissionAtStage({
  role,
  currentPhase,
  currentStatus,
}: WorkflowState): boolean {
  if (!["DRAFT", "CORRECTIONS_REQUIRED"].includes(currentStatus)) return false;
  if (role === "SUPER_ADMIN") return true;
  if (currentPhase === 1) return DEPARTMENT_ROLES.includes(role);
  if (currentPhase === 2) return role === "DEAN";
  return currentPhase >= 3 && role === "ADMIN";
}

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
    const phase = Math.min(currentPhase + 1, TOTAL_PHASES);
    return {
      ok: true,
      phase,
      status: phase === TOTAL_PHASES ? "APPROVED" : "IN_REVIEW",
    };
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
