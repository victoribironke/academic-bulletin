import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canViewSubmission,
  getApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import { resolveWorkflowTransition } from "@/lib/submissions/workflow";
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
    if (action === "SUBMIT") {
      const gate = await requireSubmissionWriteAccess(user, id);
      if (!gate.ok) {
        return NextResponse.json(
          { error: gate.message },
          { status: gate.status },
        );
      }
    } else if (action === "APPROVE" || action === "REJECT") {
      if (!["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (action === "RETURN") {
      if (
        !["PROGRAMME_COORDINATOR", "HOD", "ADMIN", "SUPER_ADMIN"].includes(
          user.role,
        )
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Get current submission
    const submission = await prisma.submission.findUnique({
      where: { id },
      select: { currentPhase: true, status: true },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
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

    if (action === "SUBMIT") {
      const blockers = await getCourseGraceBlockers(id);
      if (hasCourseGraceBlockers(blockers)) {
        return NextResponse.json(
          {
            error:
              "Every course description must pass GRACE before this bulletin can be submitted.",
            code: "GRACE_COMPLIANCE_REQUIRED",
            issues: describeCourseGraceBlockers(blockers),
            blockers,
          },
          { status: 409 },
        );
      }
    }

    // Create transition record and update submission in a transaction
    const { transition, updated } = await prisma.$transaction(async (tx) => {
      const transition = await tx.phaseTransition.create({
        data: {
          submissionId: id,
          fromPhase,
          toPhase: newPhase,
          action,
          remarks,
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
      const updated = await tx.submission.update({
        where: { id },
        data: {
          currentPhase: newPhase,
          status: newStatus,
          ...(action === "SUBMIT" && { submittedAt: new Date() }),
          ...(action === "APPROVE" &&
            newPhase === 11 && { approvedAt: new Date() }),
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
            fromPhase,
            toPhase: newPhase,
            status: newStatus,
            ...(remarks?.trim() && { remarks: remarks.trim() }),
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
