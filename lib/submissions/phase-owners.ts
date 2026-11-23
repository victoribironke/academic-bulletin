/**
 * Reads the phase-owner table and works out what someone may do with a
 * bulletin right now. Server-only; the page gets the result from the API.
 */
import type { SubmissionStatus, UserRole } from "@prisma/client";
import prisma from "@/lib/prisma";
import { PHASE_REQUIRED_EVIDENCE } from "@/lib/submissions/phases";
import {
  DEFAULT_PHASE_OWNERS,
  PHASE_CLEARING_ACTIONS,
  clearedPreviousGate,
  getWorkflowAccess,
  PHASE_OVERRIDE_REASON_LENGTH,
  type PhaseOwnerRule,
  type SubmissionAction,
} from "@/lib/submissions/workflow";
import {
  type GraceGateSummary,
  getGraceGate,
  summarizeGraceGate,
} from "@/lib/submissions/grace-gate";
import { getSubmissionWindow } from "@/lib/submissions/submission-window";

/** The phase-owner table, or today's owners while the table has no rows. */
export async function loadPhaseOwners(): Promise<PhaseOwnerRule[]> {
  const rows = await prisma.phaseOwner.findMany({
    select: { phase: true, role: true, userId: true },
  });
  return rows.length > 0 ? rows : DEFAULT_PHASE_OWNERS;
}

/** True when this user is named, not just by role, as an owner of the phase. */
export function isNamedPhaseOwner(
  owners: PhaseOwnerRule[],
  userId: string,
  phase: number,
): boolean {
  return owners.some((owner) => owner.phase === phase && owner.userId === userId);
}

/** Who moved the bulletin into its current phase; they may not also clear it. */
export async function previousGateActorId(
  submissionId: string,
  currentPhase: number,
): Promise<string | null> {
  const gate = await prisma.phaseTransition.findFirst({
    where: {
      submissionId,
      toPhase: currentPhase,
      fromPhase: { lt: currentPhase },
      action: { in: PHASE_CLEARING_ACTIONS },
    },
    orderBy: { transitionedAt: "desc" },
    select: { performedById: true },
  });
  return gate?.performedById ?? null;
}

export type SubmissionWorkflow = {
  actions: SubmissionAction[];
  /** The caller moved the bulletin into this phase, so someone else must clear it. */
  clearedPreviousGate: boolean;
  /** Evidence an approval at this phase needs, e.g. the Senate minute reference. */
  requiredEvidence: string | null;
  /** The GRACE gate on Approve, when this person can approve now. */
  graceGate: GraceGateSummary | null;
  /** Set while Submit waits for the cycle's submissions to open (F0). */
  submitClosed: { opensAt: string; message: string } | null;
  /** D4: the caller doesn't own this phase; acting needs a reason this long. */
  override: { minLength: number } | null;
};

export async function getSubmissionWorkflow(
  user: { id: string; role: UserRole },
  submission: { id: string; currentPhase: number; status: SubmissionStatus },
): Promise<SubmissionWorkflow> {
  const access = getWorkflowAccess({
    role: user.role,
    userId: user.id,
    currentPhase: submission.currentPhase,
    currentStatus: submission.status,
    owners: await loadPhaseOwners(),
  });
  const allowed = access.actions;
  const previousActor = await previousGateActorId(submission.id, submission.currentPhase);
  const blocked = allowed.some((action) => clearedPreviousGate(action, user.id, previousActor));

  const actions = blocked
    ? allowed.filter((action) => !PHASE_CLEARING_ACTIONS.includes(action))
    : allowed;
  return {
    actions,
    clearedPreviousGate: blocked,
    requiredEvidence: PHASE_REQUIRED_EVIDENCE[submission.currentPhase] ?? null,
    graceGate: actions.includes("APPROVE")
      ? summarizeGraceGate(await getGraceGate(submission.id), user.role)
      : null,
    submitClosed: actions.includes("SUBMIT") ? await closedSubmit(submission.id) : null,
    override:
      access.viaOverride && actions.length > 0 ? { minLength: PHASE_OVERRIDE_REASON_LENGTH.min } : null,
  };
}

async function closedSubmit(submissionId: string) {
  const window = await getSubmissionWindow(submissionId);
  return window.open ? null : { opensAt: window.opensAt, message: window.message };
}
