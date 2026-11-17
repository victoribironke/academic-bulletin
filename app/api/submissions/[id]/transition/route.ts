import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canViewSubmission,
  getApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import {
  canPerformWorkflowAction,
  clearedPreviousGate,
  resolveWorkflowTransition,
} from "@/lib/submissions/workflow";
import { loadPhaseOwners, previousGateActorId } from "@/lib/submissions/phase-owners";
import { bulletinContentHash, linkStateChangeToLedger } from "@/lib/submissions/ledger";
import { PHASE_REQUIRED_EVIDENCE } from "@/lib/submissions/phases";
import { getSubmitReadinessIssues } from "@/lib/submissions/submit-readiness";
import { recordActivity } from "@/lib/activity-log";
import {
  describeCourseGraceBlockers,
  getCourseGraceBlockers,
  hasCourseGraceBlockers,
} from "@/lib/courses/grace-compliance";

interface RouteParams {
  params: Promise<{ id: string }>;
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await canViewSubmission(user, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Get current submission
    const submission = await prisma.submission.findUnique({
      where: { id },
      select: { currentPhase: true, status: true, submittedAt: true },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    // Refuse the wrong role or the wrong phase before anything else, so a
    // caller who may not act here learns nothing about the record's state.
    if (
      !canPerformWorkflowAction(
        {
          role: user.role,
          userId: user.id,
          currentPhase: submission.currentPhase,
          currentStatus: submission.status,
          owners: await loadPhaseOwners(),
        },
        action,
      )
    ) {
      return NextResponse.json(
        { error: "This action is not available to your role at the current phase." },
        { status: 403 },
      );
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

    if (action === "SUBMIT") {
      const gate = await requireSubmissionWriteAccess(user, id);
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.message },
          { status: gate.status },
        );
      }

      // Report every problem at once, so the department can fix them in one go.
      const readiness = await getSubmitReadinessIssues(id);
      const blockers = await getCourseGraceBlockers(id);
      const graceBlocked = hasCourseGraceBlockers(blockers);
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
            ],
            readiness,
            ...(graceBlocked && { blockers }),
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
          description: `${action.charAt(0)}${action.slice(1).toLowerCase()} action recorded for ${updated.programme.name}.`,
          metadata: {
            transitionId: transition.id,
            fromPhase,
            toPhase: newPhase,
            status: newStatus,
            ...(remarks?.trim() && { remarks: remarks.trim() }),
            ...(requiredEvidence && { reference }),
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
      { error: "Failed to transition submission" },
      { status: 500 },
    );
  }
}
