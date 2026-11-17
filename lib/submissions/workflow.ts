import type { SubmissionStatus, UserRole } from "@prisma/client";
import { TOTAL_PHASES } from "@/lib/submissions/phases";

export type SubmissionAction = "SUBMIT" | "APPROVE" | "REJECT" | "RETURN";

export type WorkflowTransition =
  | { ok: true; phase: number; status: SubmissionStatus }
  | { ok: false; statusCode: 400 | 409; message: string };

/** One row of the phase-owner table: a role, or a single named user. */
export type PhaseOwnerRule = {
  phase: number;
  role: UserRole | null;
  userId: string | null;
};

type WorkflowState = {
  role: UserRole;
  /** Needed to match owners named by user rather than by role. */
  userId?: string;
  currentPhase: number;
  currentStatus: SubmissionStatus;
  /** The phase-owner table; the defaults below until it has been loaded. */
  owners?: PhaseOwnerRule[];
};

/**
 * Today's owners: the department at Phase 1, the Dean at Phase 2, Academic
 * Planning from Phase 3. The phase_owners table starts with these rows and is
 * the authority once it has any.
 */
export const DEFAULT_PHASE_OWNERS: PhaseOwnerRule[] = [
  { phase: 1, role: "HOD", userId: null },
  { phase: 1, role: "PROGRAMME_COORDINATOR", userId: null },
  { phase: 2, role: "DEAN", userId: null },
  ...Array.from({ length: TOTAL_PHASES - 2 }, (_, index) => ({
    phase: index + 3,
    role: "ADMIN" as UserRole,
    userId: null,
  })),
];

/** Actions that close the current phase and move the bulletin forward. */
export const PHASE_CLEARING_ACTIONS: SubmissionAction[] = ["SUBMIT", "APPROVE"];

export function isPhaseOwner(
  { role, userId }: { role: UserRole; userId?: string },
  phase: number,
  owners: PhaseOwnerRule[] = DEFAULT_PHASE_OWNERS,
): boolean {
  return owners.some(
    (owner) =>
      owner.phase === phase &&
      ((owner.role !== null && owner.role === role) ||
        (owner.userId !== null && owner.userId === userId)),
  );
}

/**
 * Which actions the caller may take at the bulletin's current phase. The page
 * shows only what the API returns from this, and the API remains the final
 * authority. Super Admin is the recovery override at every phase.
 */
export function getAllowedWorkflowActions({
  role,
  userId,
  currentPhase,
  currentStatus,
  owners,
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

  const isSuperAdmin = role === "SUPER_ADMIN";
  const ownsPhase = isSuperAdmin || isPhaseOwner({ role, userId }, currentPhase, owners);

  if (currentStatus === "DRAFT" || currentStatus === "CORRECTIONS_REQUIRED") {
    return ownsPhase ? ["SUBMIT"] : [];
  }

  if (currentStatus !== "IN_REVIEW") return [];

  // Review starts at Phase 2, and only Academic Planning's phases can send a
  // bulletin all the way back to the department.
  if (!ownsPhase || (currentPhase < 2 && !isSuperAdmin)) return [];
  return currentPhase >= 3
    ? ["APPROVE", "RETURN", "REJECT"]
    : ["APPROVE", "RETURN"];
}

export function canPerformWorkflowAction(
  state: WorkflowState,
  action: string,
): action is SubmissionAction {
  return getAllowedWorkflowActions(state).includes(action as SubmissionAction);
}

/** The same phase ownership also governs who can edit drafts and corrections. */
export function canEditSubmissionAtStage({
  role,
  userId,
  currentPhase,
  currentStatus,
  owners,
}: WorkflowState): boolean {
  if (!["DRAFT", "CORRECTIONS_REQUIRED"].includes(currentStatus)) return false;
  if (role === "SUPER_ADMIN") return true;
  return isPhaseOwner({ role, userId }, currentPhase, owners);
}

/**
 * Separation of duties: whoever moved the bulletin into this phase may not
 * also clear it, so no single person can pass two gates in a row.
 */
export function clearedPreviousGate(
  action: string,
  actorId: string,
  previousGateActorId: string | null | undefined,
): boolean {
  return (
    PHASE_CLEARING_ACTIONS.includes(action as SubmissionAction) &&
    Boolean(previousGateActorId) &&
    previousGateActorId === actorId
  );
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
