import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canViewSubmission,
  canWriteSubmission,
  getApiUser,
  requireApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import { AUTOSAVE_COALESCE_MINUTES, recordActivity } from "@/lib/activity-log";
import { getSubmissionWorkflow } from "@/lib/submissions/phase-owners";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/submissions/[id] - Get a single submission with all details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser();
    if (!auth.ok) return auth.response;
    if (!(await canViewSubmission(auth.user, id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        programme: {
          select: {
            id: true,
            name: true,
            code: true,
            duration: true,
            department: {
              select: {
                id: true,
                name: true,
                code: true,
                school: {
                  select: { id: true, name: true, code: true },
                },
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        content: true,
        comments: {
          include: {
            author: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        phaseTransitions: {
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
          orderBy: { transitionedAt: "desc" },
        },
      },
    });

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    // What this person may do now, worked out from the phase owners, so the
    // page shows exactly the actions the transition route will accept.
    const workflow = {
      ...(await getSubmissionWorkflow(auth.user, submission)),
      canEdit: await canWriteSubmission(auth.user, id),
    };

    return NextResponse.json({ ...submission, workflow });
  } catch (error) {
    console.error("Failed to fetch submission:", error);
    return NextResponse.json(
      { error: "Failed to fetch submission" },
      { status: 500 },
    );
  }
}

// PUT /api/submissions/[id] - Update submission (content, status)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, content } = body;

    // Status only changes through the workflow (transition route), which
    // runs the GRACE and review checks. Never accept it here.
    if (body.status !== undefined) {
      return NextResponse.json(
        {
          error:
            "The submission status can only be changed through the workflow actions.",
        },
        { status: 400 },
      );
    }

    // Server-side ownership check
    const user = await getApiUser();
    const gate = await requireSubmissionWriteAccess(user, id);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.message },
        { status: gate.status },
      );
    }

    // Update submission
    await prisma.submission.update({
      where: { id },
      data: {
        ...(title && { title }),
      },
    });

    // Normalize employability: client sends array, schema expects String?
    const normalizeEmployability = (val: unknown): string | null => {
      if (Array.isArray(val)) {
        const filtered = val.filter((s: string) => s.trim());
        return filtered.length > 0 ? filtered.join("; ") : null;
      }
      return (val as string) || null;
    };

    // Update content if provided
    if (content) {
      await prisma.submissionContent.upsert({
        where: { submissionId: id },
        update: {
          // Programme info (dean/HOD images, etc.)
          ...(content.programmeInfo !== undefined && {
            programmeInfo: content.programmeInfo,
          }),
          // Structured fields
          ...(content.philosophy !== undefined && {
            philosophy: content.philosophy,
          }),
          // The philosophy's GRACE result is written only by the GRACE check
          // itself; a save can't mark the philosophy as passed.
          ...(content.mission !== undefined && { mission: content.mission }),
          ...(content.vision !== undefined && { vision: content.vision }),
          ...(content.objectives !== undefined && {
            objectives: content.objectives,
          }),
          ...(content.uniqueFeatures !== undefined && {
            uniqueFeatures: content.uniqueFeatures,
          }),
          ...(content.employability !== undefined && {
            employability: normalizeEmployability(content.employability),
          }),
          ...(content.utmeRequirements !== undefined && {
            utmeRequirements: content.utmeRequirements,
          }),
          ...(content.directEntryRequirements !== undefined && {
            directEntryRequirements: content.directEntryRequirements,
          }),
          ...(content.transferRequirements !== undefined && {
            transferRequirements: content.transferRequirements,
          }),
          ...(content.minimumDuration !== undefined && {
            minimumDuration: content.minimumDuration,
          }),
          ...(content.graduationRequirements !== undefined && {
            graduationRequirements: content.graduationRequirements,
          }),
          ...(content.minimumCGPA !== undefined && {
            minimumCGPA: content.minimumCGPA,
          }),
          ...(content.totalUnits !== undefined && {
            totalUnits: content.totalUnits,
          }),
          // Legacy sections
          ...(content.sectionA !== undefined && { sectionA: content.sectionA }),
          ...(content.sectionB !== undefined && { sectionB: content.sectionB }),
          ...(content.sectionC !== undefined && { sectionC: content.sectionC }),
          ...(content.sectionD !== undefined && { sectionD: content.sectionD }),
          ...(content.sectionE !== undefined && { sectionE: content.sectionE }),
          ...(content.sectionF !== undefined && { sectionF: content.sectionF }),
          ...(content.sectionG !== undefined && { sectionG: content.sectionG }),
          ...(content.sectionH !== undefined && { sectionH: content.sectionH }),
        },
        create: {
          submissionId: id,
          programmeInfo: content.programmeInfo || null,
          philosophy: content.philosophy || null,
          mission: content.mission || null,
          vision: content.vision || null,
          objectives: content.objectives || null,
          uniqueFeatures: content.uniqueFeatures || null,
          employability: normalizeEmployability(content.employability),
          utmeRequirements: content.utmeRequirements || null,
          directEntryRequirements: content.directEntryRequirements || null,
          transferRequirements: content.transferRequirements || null,
          minimumDuration: content.minimumDuration || null,
          graduationRequirements: content.graduationRequirements || null,
          minimumCGPA: content.minimumCGPA || null,
          totalUnits: content.totalUnits || null,
          sectionF: content.sectionF || null,
          sectionG: content.sectionG || null,
        },
      });
    }

    await recordActivity({
      actorId: user!.id,
      action: "SUBMISSION_SAVED",
      entityType: "SUBMISSION",
      entityId: id,
      description: "Saved changes to the bulletin submission.",
      metadata: { updatedContent: Boolean(content) },
      // Autosave fires every few seconds; log one entry per editing session.
      coalesceWithinMinutes: AUTOSAVE_COALESCE_MINUTES,
    });

    // Re-fetch with full data
    const updated = await prisma.submission.findUnique({
      where: { id },
      include: {
        programme: {
          select: { id: true, name: true, code: true },
        },
        content: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error("Failed to update submission:", error);

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update submission" },
      { status: 500 },
    );
  }
}

// DELETE /api/submissions/[id] - Delete a submission
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const user = await getApiUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The workflow ledger is permanent, so a bulletin that has moved through
    // any phase can't be deleted with it.
    if ((await prisma.phaseTransition.count({ where: { submissionId: id } })) > 0) {
      return NextResponse.json(
        {
          error:
            "This bulletin has workflow history, so it can't be deleted.",
          code: "HAS_WORKFLOW_HISTORY",
        },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await recordActivity(
        {
          actorId: user.id,
          action: "SUBMISSION_DELETED",
          entityType: "SUBMISSION",
          entityId: id,
          description: "Deleted a bulletin submission.",
        },
        tx,
      );
      await tx.submission.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Failed to delete submission:", error);

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: "Failed to delete submission" },
      { status: 500 },
    );
  }
}
