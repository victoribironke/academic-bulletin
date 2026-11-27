import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { CONFLICT_FIELDS, editConflicts } from "@/lib/submissions/edit-conflicts";
import {
  canReadSubmission,
  canViewSubmission,
  canWriteSubmission,
  getApiUser,
  requireApiUser,
  requireSubmissionWriteAccess,
} from "@/lib/api-auth";
import { AUTOSAVE_COALESCE_MINUTES, recordActivity } from "@/lib/activity-log";
import { getSubmissionWorkflow, loadPhaseOwners } from "@/lib/submissions/phase-owners";
import { workflowHistoryConflict } from "@/lib/submissions/workflow-history";
import { unsafeMarkupReason } from "@/lib/html/safe-html";
import { inUseResponse, requireDeleteConfirmation } from "@/lib/archive";
import { photoNotUploadedHere } from "@/lib/images/photo-urls";
import { isValidMinimumCgpa, minimumCgpaRuleMessage } from "@/lib/submissions/cgpa-rule";
import { refuseIfArchived } from "@/lib/cycles/archive";
import { RECALL_PHASE, isPhaseOwner } from "@/lib/submissions/workflow";
import { NOT_SIGNED_IN, NO_ACCESS, couldNot } from "@/lib/messages";
import { baselineFor, stillCarried } from "@/lib/bulletin/baseline";

/** Content columns that aren't anything a person wrote. */
const BOOKKEEPING_FIELDS = new Set([
  "id",
  "submissionId",
  "createdAt",
  "updatedAt",
  "philosophyGracePass",
  "philosophyGrace",
]);

/** True for text, numbers or lists that hold something someone entered. */
function hasWrittenValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number" || value === true) return true;
  if (Array.isArray(value)) return value.some(hasWrittenValue);
  if (typeof value === "object") return Object.values(value).some(hasWrittenValue);
  return false;
}

/** Why a bulletin can't be deleted: anything already written in it. */
function submissionDeleteBlockers(submission: {
  content: Record<string, unknown> | null;
  _count: { courses: number; comments: number };
}): string[] {
  const reasons: string[] = [];
  const { courses, comments } = submission._count;
  if (courses) reasons.push(`It has ${courses} course${courses === 1 ? "" : "s"}.`);
  if (comments) reasons.push(`It has ${comments} comment${comments === 1 ? "" : "s"}.`);
  const written = Object.entries(submission.content ?? {}).some(
    ([key, value]) => !BOOKKEEPING_FIELDS.has(key) && hasWrittenValue(value),
  );
  if (written) reasons.push("Some of its sections have been filled in.");
  return reasons;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/submissions/[id] - Get a single submission with all details
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const auth = await requireApiUser(undefined, { limitedRoles: ["COMMITTEE_MEMBER"] });
    if (!auth.ok) return auth.response;
    const isMember = await canViewSubmission(auth.user, id);
    if (!isMember && !(await canReadSubmission(auth.user, id))) {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }

    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        // Task A2: the page says when the draft is in an archived cycle.
        cycle: { select: { name: true, isTest: true, archivedAt: true } },
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

    if (!isMember) {
      // Browsing HODs see the bulletin, not the review discussion, and can't
      // act on it whatever their role would allow in their own department.
      return NextResponse.json({
        ...submission,
        comments: [],
        phaseTransitions: submission.phaseTransitions.map((transition) => ({
          ...transition,
          remarks: null,
        })),
        workflow: {
          actions: [],
          canEdit: false,
          clearedPreviousGate: false,
          requiredEvidence: null,
          graceGate: null,
          submitClosed: null,
          override: null,
        },
      });
    }

    // An archived cycle's draft is read-only for everyone: no actions.
    if (submission.cycle?.archivedAt) {
      return NextResponse.json({
        ...submission,
        workflow: {
          actions: [],
          canEdit: false,
          clearedPreviousGate: false,
          requiredEvidence: null,
          graceGate: null,
          submitClosed: null,
          override: null,
        },
      });
    }

    // D5: the Dean's first look at School Board Harmonisation ends the
    // department's chance to recall the programme.
    if (
      submission.currentPhase === RECALL_PHASE &&
      submission.status === "IN_REVIEW" &&
      !submission.openedByDeanAt &&
      isPhaseOwner({ role: auth.user.role, userId: auth.user.id }, RECALL_PHASE, await loadPhaseOwners())
    ) {
      const openedAt = new Date();
      await prisma.submission.update({ where: { id }, data: { openedByDeanAt: openedAt } });
      await recordActivity({
        actorId: auth.user.id,
        action: "SUBMISSION_OPENED_BY_DEAN",
        entityType: "SUBMISSION",
        entityId: id,
        description: `Opened ${submission.programme.name} at School Board Harmonisation; the department can no longer recall it.`,
      });
      submission.openedByDeanAt = openedAt;
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
      { error: couldNot("load submission") },
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

    // Rich text is shown on reviewers' pages, so it may carry only the
    // editor's formatting (the page also cleans it before showing it).
    for (const [key, label] of [
      ["sectionF", "Programme Regulations"],
      ["sectionG", "Summary of Changes"],
    ] as const) {
      const value = content?.[key]?.content;
      const reason = typeof value === "string" ? unsafeMarkupReason(value) : null;
      if (reason) {
        return NextResponse.json(
          {
            error: `${label} contains ${reason}, which can't be saved. Use the editor's formatting only.`,
            code: "UNSAFE_MARKUP",
          },
          { status: 400 },
        );
      }
    }

    // Dean and HOD photos must be ones uploaded to the app.
    if (content?.programmeInfo !== undefined) {
      const saved = await prisma.submissionContent.findUnique({
        where: { submissionId: id },
        select: { programmeInfo: true },
      });
      const photo = photoNotUploadedHere(content.programmeInfo, saved?.programmeInfo);
      if (photo) {
        return NextResponse.json(
          {
            error: `The ${photo} has to be uploaded here. Upload it again, then save.`,
            code: "PHOTO_NOT_UPLOADED",
          },
          { status: 400 },
        );
      }
    }

    // Rule W6: the minimum CGPA is 2.00 to 5.00 (empty is allowed while drafting).
    if (
      content?.minimumCGPA !== undefined &&
      content.minimumCGPA !== null &&
      !isValidMinimumCgpa(content.minimumCGPA)
    ) {
      return NextResponse.json(
        { error: minimumCgpaRuleMessage(content.minimumCGPA), code: "CGPA_OUT_OF_RANGE" },
        { status: 400 },
      );
    }

    // G3: someone else saved a field this save would overwrite since this
    // page last saw it. The person decides (resend with force: true).
    if (content && body.previous && body.force !== true) {
      const saved = await prisma.submissionContent.findUnique({ where: { submissionId: id } });
      const clashes = editConflicts(body.previous, saved as Record<string, unknown> | null, content);
      if (clashes.length > 0) {
        const other = await prisma.activityLog.findFirst({
          where: { entityId: id, action: "SUBMISSION_SAVED", NOT: { actorId: user!.id } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, actor: { select: { firstName: true, lastName: true } } },
        });
        return NextResponse.json(
          {
            error: `Someone else changed ${clashes.map((key) => CONFLICT_FIELDS[key]).join(", ")} while you were editing.`,
            code: "EDIT_CONFLICT",
            fields: clashes,
            labels: clashes.map((key) => CONFLICT_FIELDS[key]),
            by: other?.actor ? `${other.actor.firstName} ${other.actor.lastName}`.trim() : null,
            at: other?.createdAt?.toISOString() ?? null,
          },
          { status: 409 },
        );
      }
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

    // E2/V18: a carried field the Head has now edited is no longer carried.
    if (updated?.content && updated.content.carriedFields.length > 0) {
      const remaining = stillCarried(updated.content.carriedFields, baselineFor(updated.programme.code), updated.content);
      if (remaining.length !== updated.content.carriedFields.length) {
        await prisma.submissionContent.update({ where: { submissionId: id }, data: { carriedFields: remaining } });
        updated.content.carriedFields = remaining;
      }
    }

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
      { error: couldNot("update submission") },
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
      return NextResponse.json({ error: NOT_SIGNED_IN }, { status: 401 });
    }
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: NO_ACCESS }, { status: 403 });
    }
    const archived = await refuseIfArchived(id);
    if (archived) return archived;

    // The workflow ledger is permanent, so a bulletin that has moved through
    // any phase can't be deleted with it.
    const conflict = await workflowHistoryConflict({ submissionId: id });
    if (conflict) return conflict;

    // Deleting a bulletin is permanent, so only an empty one can go: no
    // courses, comments or written sections. Its programme name is typed to
    // confirm.
    const submission = await prisma.submission.findUnique({
      where: { id },
      select: {
        programme: { select: { name: true } },
        content: true,
        _count: { select: { courses: true, comments: true } },
      },
    });
    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }
    const blockers = submissionDeleteBlockers(submission);
    if (blockers.length) return inUseResponse("bulletin", blockers);
    const unconfirmed = await requireDeleteConfirmation(request, "draft");
    if (unconfirmed) return unconfirmed;

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
      { error: couldNot("delete submission") },
      { status: 500 },
    );
  }
}
