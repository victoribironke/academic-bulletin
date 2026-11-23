import type { SubmissionStatus, UserRole } from "@prisma/client";
import { TOTAL_PHASES } from "@/lib/submissions/phases";

export type SubmissionAction = "SUBMIT" | "APPROVE" | "REJECT" | "RETURN" | "RECALL";

/**
 * D5: the department takes back a programme it submitted, while it waits at
 * School Board Harmonisation and the Dean hasn't opened it. It goes back to
 * Draft (never "Revision requested") and is logged as a recall.
 */
export const RECALL_PHASE = 2;

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

/** Shortest reason for acting on a phase someone else owns (task D4). */
export const PHASE_OVERRIDE_REASON_LENGTH = { min: 20, max: 500 } as const;

/**
 * Who may act on a phase they do not own, and only through an override with
 * a written reason that is flagged (work order D4, Appendix B): a Super
 * Administrator at any phase; an Academic Planning admin at School Board
 * Harmonisation (Phase 2). A Head of Department never can.
 */
export function canOverridePhase(role: UserRole, phase: number): boolean {
  if (role === "SUPER_ADMIN") return true;
  return role === "ADMIN" && phase === 2;
}

export type WorkflowAccess = {
  actions: SubmissionAction[];
  /** The caller doesn't own this phase: every action needs an override reason. */
  viaOverride: boolean;
};

/**
 * Which actions the caller may take at the bulletin's current phase, and
 * whether they act as its owner or through an override. The page shows only
 * what the API returns from this, and the API remains the final authority.
 */
export function getWorkflowAccess({
  role,
  userId,
  currentPhase,
  currentStatus,
  owners,
}: WorkflowState): WorkflowAccess {
  const none = { actions: [], viaOverride: false };
  if (
    !Number.isInteger(currentPhase) ||
    currentPhase < 1 ||
    currentPhase > TOTAL_PHASES ||
    currentStatus === "APPROVED" ||
    currentStatus === "REJECTED"
  ) {
    return none;
  }

  // D5: the department that owns Phase 1 may recall a programme waiting at
  // Phase 2 (whether the Dean has opened it is checked when it's tried).
  if (
    currentPhase === RECALL_PHASE &&
    currentStatus === "IN_REVIEW" &&
    !isPhaseOwner({ role, userId }, currentPhase, owners) &&
    isPhaseOwner({ role, userId }, RECALL_PHASE - 1, owners)
  ) {
    return { actions: ["RECALL"], viaOverride: false };
  }

  const isSuperAdmin = role === "SUPER_ADMIN";
  const owner = isPhaseOwner({ role, userId }, currentPhase, owners);
  const viaOverride = !owner && canOverridePhase(role, currentPhase);
  if (!owner && !viaOverride) return none;

  let actions: SubmissionAction[] = [];
  if (currentStatus === "DRAFT" || currentStatus === "CORRECTIONS_REQUIRED") {
    actions = ["SUBMIT"];
  } else if (currentStatus === "IN_REVIEW") {
    // Review starts at Phase 2, and only Academic Planning's phases can send
    // a bulletin all the way back to the department.
    if (currentPhase < 2 && !isSuperAdmin) return none;
    actions = currentPhase >= 3 ? ["APPROVE", "RETURN", "REJECT"] : ["APPROVE", "RETURN"];
  }
  return actions.length > 0 ? { actions, viaOverride } : none;
}

export function getAllowedWorkflowActions(state: WorkflowState): SubmissionAction[] {
  return getWorkflowAccess(state).actions;
}

/**
 * Reads an override reason from a request: a string, or { reason }. Returns
 * the trimmed reason, or an error to show.
 */
export function readOverrideReason(
  value: unknown,
): { ok: true; reason: string } | { ok: false; message: string } {
  const raw =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && typeof (value as { reason?: unknown }).reason === "string"
        ? (value as { reason: string }).reason
        : "";
  const reason = raw.trim();
  if (reason.length < PHASE_OVERRIDE_REASON_LENGTH.min) {
    return {
      ok: false,
      message: `You don't own this phase, so acting on it is an override. Give a reason of at least ${PHASE_OVERRIDE_REASON_LENGTH.min} characters; it is flagged on the programme and in the Activity Log.`,
    };
  }
  if (reason.length > PHASE_OVERRIDE_REASON_LENGTH.max) {
    return { ok: false, message: `Keep the override reason under ${PHASE_OVERRIDE_REASON_LENGTH.max} characters.` };
  }
  return { ok: true, reason };
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

  if (action === "RECALL") {
    if (currentPhase !== RECALL_PHASE || currentStatus !== "IN_REVIEW") {
      return {
        ok: false,
        statusCode: 409,
        message: "Only a programme waiting for the Dean at School Board Harmonisation can be recalled.",
      };
    }
    return { ok: true, phase: RECALL_PHASE - 1, status: "DRAFT" };
  }

  if (!["APPROVE", "REJECT", "RETURN"].includes(action)) {
    return {
      ok: false,
      statusCode: 400,
      message: "Invalid action. Use APPROVE, REJECT, RETURN, RECALL, or SUBMIT.",
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
