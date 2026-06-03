import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getApiUser, requireSubmissionWriteAccess } from "@/lib/api-auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/submissions/[id]/transition - Transition to a new phase
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { action, toPhase, remarks, performedById } = body;

    if (!action || !performedById) {
      return NextResponse.json(
        { error: "Action and performedById are required" },
        { status: 400 },
      );
    }

    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.id !== performedById) {
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
      if (!["HOD", "ADMIN", "SUPER_ADMIN"].includes(user.role)) {
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
    let newPhase = fromPhase;
    let newStatus = submission.status;

    // Determine new phase and status based on action
    switch (action) {
      case "APPROVE":
        // Move to next phase (max 11)
        newPhase = toPhase || Math.min(fromPhase + 1, 11);
        newStatus = newPhase === 11 ? "APPROVED" : "IN_REVIEW";
        break;
      case "REJECT":
        // Return to draft status
        newPhase = 1;
        newStatus = "REJECTED";
        break;
      case "RETURN":
        // Return to previous phase
        newPhase = toPhase || Math.max(fromPhase - 1, 1);
        newStatus = "IN_REVIEW";
        break;
      case "SUBMIT":
        // Submit for review (move from draft to phase 1 in review)
        newPhase = 1;
        newStatus = "IN_REVIEW";
        break;
      default:
        return NextResponse.json(
          { error: "Invalid action. Use APPROVE, REJECT, RETURN, or SUBMIT" },
          { status: 400 },
        );
    }

    // Create transition record and update submission in a transaction
    const [transition, updated] = await prisma.$transaction([
      prisma.phaseTransition.create({
        data: {
          submissionId: id,
          fromPhase,
          toPhase: newPhase,
          action,
          remarks,
          performedById,
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
      }),
      prisma.submission.update({
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
      }),
    ]);

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
