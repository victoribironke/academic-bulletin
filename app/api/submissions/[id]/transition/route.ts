import { after, NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canViewSubmission,
  getApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import {
  COORDINATOR_SUBMIT_NOTE,
  clearedPreviousGate,
  getWorkflowAccess,
  readOverrideReason,
  resolveWorkflowTransition,
} from "@/lib/submissions/workflow";
import { loadPhaseOwners, previousGateActorId } from "@/lib/submissions/phase-owners";
import { bulletinContentHash, linkStateChangeToLedger } from "@/lib/submissions/ledger";
import { PHASE_REQUIRED_EVIDENCE } from "@/lib/submissions/phases";
import { blocking, runChecks } from "@/lib/checks/run";
import { getSubmissionWindow } from "@/lib/submissions/submission-window";
import { recordActivity } from "@/lib/activity-log";
import {
  type CourseGraceBlockers,
  describeCourseGraceBlockers,
  drainSubmissionGraceQueue,
  getCourseGraceBlockers,
  hasCourseGraceBlockers,
} from "@/lib/courses/grace-compliance";
import { takeRateLimit } from "@/lib/rate-limit";
import {
  type GraceOverrideRecord,
  canOverrideGrace,
  decideGraceApproval,
  getGraceGate,
  readGraceOverride,
} from "@/lib/submissions/grace-gate";
import { GRACE_OVERRIDE_REASON_LENGTH } from "@/lib/grace-config";
import { refuseIfArchived } from "@/lib/cycles/archive";
import { formatDateTime } from "@/lib/dates/format";
import { REQUEST_REVISION_LABEL } from "@/lib/submissions/phases";
import { NOT_SIGNED_IN, NO_ACCESS, couldNot } from "@/lib/messages";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// A refused Submit can go on running waiting GRACE checks after it responds.
export const maxDuration = 60;
const SUBMIT_GRACE_BUDGET_MS = 30_000;

/**
 * Submit and Approve are moments queued GRACE checks run: when one is refused
 * because course checks are still waiting, it starts them on the server after
 * responding, so trying again shortly can succeed. It counts against the same
 * per-person limit as running the queue from the page.
 */
async function startWaitingGraceChecks(
  submissionId: string,
  userId: string,
  blockers: CourseGraceBlockers,
): Promise<boolean> {
  if (blockers.pending.length + blockers.changed.length === 0) return false;
  try {
    if (!(await takeRateLimit("graceQueue", userId)).ok) return false;
  } catch (error) {
    // Submit is refused either way. If the checks can't be counted they just
    // don't start now; the page or the daily job runs them later.
    console.error("Couldn't count the GRACE checks Submit would start:", error);
    return false;
  }
  after(async () => {
    try {
      await drainSubmissionGraceQueue(submissionId, SUBMIT_GRACE_BUDGET_MS);
    } catch (error) {
      console.error("GRACE checks started by Submit failed:", error);
    }
  });
  return true;
}

// POST /api/submissions/[id]/transition - Transition to a new phase
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, remarks } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Action is required" },
        { status: 400 },
      );
    }

    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: NOT_SIGNED_IN }, { status: 401 });
    }
    if (!(await canViewSubmission(user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    const archived = await refuseIfArchived(id);
    if (archived) return archived;
    // Get current submission
    const submission = await prisma.submission.findUnique({
      where: { id },
      select: { currentPhase: true, status: true, submittedAt: true, openedByDeanAt: true },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    // Refuse the wrong role or the wrong phase before anything else, so a
    // caller who may not act here learns nothing about the record's state.
    const access = getWorkflowAccess({
      role: user.role,
      userId: user.id,
      currentPhase: submission.currentPhase,
      currentStatus: submission.status,
      owners: await loadPhaseOwners(),
    });
    if (!access.actions.includes(action)) {
      // G2: say who submits, rather than a bare refusal.
      if (user.role === "PROGRAMME_COORDINATOR" && (action === "SUBMIT" || action === "RECALL")) {
        return NextResponse.json({ error: COORDINATOR_SUBMIT_NOTE, code: "HEAD_SUBMITS" }, { status: 403 });
      }
      return NextResponse.json(
        { error: "This action is not available to your role at the current phase." },
        { status: 403 },
      );
    }

    // D5: a recall works only until the Dean opens the programme.
    if (action === "RECALL" && submission.openedByDeanAt) {
      return NextResponse.json(
        {
          error: `The Dean opened this programme on ${formatDateTime(submission.openedByDeanAt)}, so it can no longer be recalled. If it needs changes, ask the Dean to use "${REQUEST_REVISION_LABEL}".`,
          code: "OPENED_BY_DEAN",
        },
        { status: 409 },
      );
    }

    // D4: acting on a phase you do not own is an override with a written
    // reason, flagged on the programme and in the Activity Log.
    let phaseOverride: { reason: string; role: string } | null = null;
    if (access.viaOverride) {
      const override = readOverrideReason(body.override);
      if (!override.ok) {
        return NextResponse.json(
          { error: override.message, code: "OVERRIDE_REASON_REQUIRED" },
          { status: 403 },
        );
      }
      phaseOverride = { reason: override.reason, role: user.role };
    }

    if (
      clearedPreviousGate(
        action,
        user.id,
        await previousGateActorId(id, submission.currentPhase),
      )
    ) {
      return NextResponse.json(
        {
          error:
            "You moved this bulletin into its current phase, so someone else must clear it.",
          code: "SEPARATION_OF_DUTIES",
        },
        { status: 403 },
      );
    }

    const fromPhase = submission.currentPhase;
    const resolved = resolveWorkflowTransition({
      action,
      currentPhase: fromPhase,
      currentStatus: submission.status,
      remarks,
    });
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.message },
        { status: resolved.statusCode },
      );
    }
    const newPhase = resolved.phase;
    const newStatus = resolved.status;

    // Some phases close only with evidence, e.g. Senate with its minute reference.
    const requiredEvidence =
      action === "APPROVE" ? PHASE_REQUIRED_EVIDENCE[fromPhase] : undefined;
    const reference =
      typeof body.reference === "string" ? body.reference.trim() : "";
    if (requiredEvidence && (!reference || reference.length > 200)) {
      return NextResponse.json(
        {
          error: `Enter the ${requiredEvidence} (up to 200 characters) to approve this phase.`,
          code: "EVIDENCE_REQUIRED",
        },
        { status: 400 },
      );
    }

    // No bulletin is approved on with a failing or out-of-date GRACE result,
    // unless an allowed role overrides it with a reason (kept in the ledger).
    let graceOverride: GraceOverrideRecord | null = null;
    let checksOverride: { reason: string; open: string[] } | null = null;
    if (action === "APPROVE") {
      const graceGate = await getGraceGate(id);
      const decision = decideGraceApproval({
        role: user.role,
        gate: graceGate,
        override: readGraceOverride(body),
      });
      if (!decision.ok) {
        const startedChecks =
          decision.code === "GRACE_APPROVAL_BLOCKED" &&
          (await startWaitingGraceChecks(id, user.id, graceGate.courses));
        return NextResponse.json(
          {
            error: decision.error,
            code: decision.code,
            issues: [
              ...graceGate.issues,
              ...(startedChecks
                ? [
                    "GRACE checks have started for the courses still waiting. Try approving again in a few minutes.",
                  ]
                : []),
            ],
            blockers: graceGate.courses,
            ...(startedChecks && { gracePending: true }),
          },
          { status: decision.status },
        );
      }
      graceOverride = decision.override;

      // F3: approving needs the checks to pass and no open comments (GRACE
      // has its own gate just above, with its override). D4: only a Super
      // Administrator gets past, with a written reason kept on the ledger.
      const stillOpen = blocking(await runChecks(id)).filter(
        (result) => result.rule !== "V12" && result.key !== "PHILOSOPHY_GRACE_REQUIRED",
      );
      if (stillOpen.length > 0) {
        const asked = (body as { checksOverride?: { reason?: unknown } } | null)?.checksOverride;
        const reason = typeof asked?.reason === "string" ? asked.reason.trim() : "";
        const { min, max } = GRACE_OVERRIDE_REASON_LENGTH;
        if (!asked || !canOverrideGrace(user.role) || reason.length < min || reason.length > max) {
          return NextResponse.json(
            {
              error: !asked
                ? "This bulletin can't be approved yet: resolve the open comments and the checks that must be fixed."
                : !canOverrideGrace(user.role)
                  ? "Only a Super Administrator can approve a bulletin past checks that must be fixed."
                  : `Give the reason for approving past the open checks (${min} to ${max} characters).`,
              code: !asked ? "CHECKS_OPEN" : !canOverrideGrace(user.role) ? "CHECKS_OVERRIDE_NOT_ALLOWED" : "CHECKS_OVERRIDE_REASON_REQUIRED",
              issues: stillOpen.map((result) => result.message),
            },
            { status: !asked ? 409 : !canOverrideGrace(user.role) ? 403 : 400 },
          );
        }
        checksOverride = { reason, open: stillOpen.map((result) => result.key) };
      }
    }

    if (action === "SUBMIT") {
      const gate = await requireSubmissionWriteAccess(user, id);
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.message },
          { status: gate.status },
        );
      }

      // F0: the first Submit waits until the cycle's submissions open.
      const window = await getSubmissionWindow(id);
      if (!window.open) {
        return NextResponse.json(
          { error: window.message, code: "SUBMISSIONS_NOT_OPEN", opensAt: window.opensAt },
          { status: 409 },
        );
      }

      // Report every problem at once, so the department can fix them in one go.
      // F3: every "Must fix" of the rules engine (GRACE is reported below).
      const readiness = blocking(await runChecks(id))
        .filter((result) => result.rule !== "V12")
        .map((result) => ({ code: result.key, message: result.message }));
      const blockers = await getCourseGraceBlockers(id);
      const graceBlocked = hasCourseGraceBlockers(blockers);
      const startedChecks =
        graceBlocked && (await startWaitingGraceChecks(id, user.id, blockers));
      if (readiness.length > 0 || graceBlocked) {
        return NextResponse.json(
          {
            error:
              readiness.length > 0
                ? "This bulletin is not ready to submit."
                : "Every course description must pass GRACE before this bulletin can be submitted.",
            code:
              readiness.length > 0
                ? "SUBMISSION_INCOMPLETE"
                : "GRACE_COMPLIANCE_REQUIRED",
            issues: [
              ...readiness.map((item) => item.message),
              ...(graceBlocked ? describeCourseGraceBlockers(blockers) : []),
              ...(startedChecks
                ? [
                    "GRACE checks have started for the courses still waiting. Try submitting again in a few minutes.",
                  ]
                : []),
            ],
            readiness,
            ...(graceBlocked && { blockers }),
            ...(startedChecks && { gracePending: true }),
          },
          { status: 409 },
        );
      }
    }

    // The ledger row and the change it records commit together or not at all.
    const { transition, updated } = await prisma.$transaction(async (tx) => {
      const transition = await tx.phaseTransition.create({
        data: {
          submissionId: id,
          fromPhase,
          toPhase: newPhase,
          action,
          remarks,
          reference: requiredEvidence ? reference : null,
          actorRole: user.role,
          contentHash: await bulletinContentHash(tx, id),
          ...(graceOverride && { graceOverride }),
          ...(phaseOverride && { phaseOverride }),
          performedById: user.id,
        },
        include: {
          performedBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
            },
          },
        },
      });
      await linkStateChangeToLedger(tx, transition.id);
      const updated = await tx.submission.update({
        where: { id },
        data: {
          currentPhase: newPhase,
          status: newStatus,
          ...(action === "SUBMIT" &&
            !submission.submittedAt && { submittedAt: new Date() }),
          // D5: each submission starts unopened by the Dean.
          ...(action === "SUBMIT" && { openedByDeanAt: null }),
          ...(newStatus === "APPROVED" && { approvedAt: new Date() }),
        },
        include: {
          programme: {
            select: { id: true, name: true, code: true },
          },
        },
      });
      await recordActivity(
        {
          actorId: user.id,
          action: `SUBMISSION_${action}`,
          entityType: "SUBMISSION",
          entityId: id,
          description: [
            graceOverride
              ? `Approved ${updated.programme.name} past GRACE results that hadn't passed (override): ${graceOverride.reason}`
              : action === "RECALL"
                ? `Recalled ${updated.programme.name} from the Dean before it was opened; it is a draft again.`
                : `${action.charAt(0)}${action.slice(1).toLowerCase()} action recorded for ${updated.programme.name}.`,
            checksOverride
              ? `Approved past ${checksOverride.open.length} open check${checksOverride.open.length === 1 ? "" : "s"} (override): ${checksOverride.reason}`
              : "",
            phaseOverride
              ? `Phase override: acted on Phase ${fromPhase}, which the ${phaseOverride.role.replaceAll("_", " ").toLowerCase()} role does not own. Reason: ${phaseOverride.reason}`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
          metadata: {
            transitionId: transition.id,
            fromPhase,
            toPhase: newPhase,
            status: newStatus,
            ...(remarks?.trim() && { remarks: remarks.trim() }),
            ...(requiredEvidence && { reference }),
            ...(graceOverride && { graceOverride }),
            ...(checksOverride && { checksOverride, flagged: true }),
            ...(phaseOverride && { phaseOverride, flagged: true }),
          },
        },
        tx,
      );
      return { transition, updated };
    });

    // People are emailed about this in the next daily summary
    // (see sendDailyDigests in lib/email/notifications.ts).

    return NextResponse.json({
      transition,
      submission: updated,
    });
  } catch (error) {
    console.error("Failed to transition submission:", error);
    return NextResponse.json(
      { error: couldNot("transition submission") },
      { status: 500 },
    );
  }
}
