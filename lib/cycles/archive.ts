/**
 * Archiving a whole review cycle (work order task A2, decision DEC5).
 *
 * The test cycle is archived and tagged TEST, not deleted. Its drafts,
 * comments, photos and log entries stay where they are, linked to the cycle,
 * so restoring is one step and nothing is lost. While archived:
 *
 * - the cycle is closed and can't be reopened (restore it first);
 * - its drafts are read-only for everyone, and only Academic Planning can
 *   open them (from the Archive);
 * - every dashboard, count, list, reminder, bulletin and default view leaves
 *   them out, and so does the activity log unless asked to include them.
 */
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

/** The app's database client; scripts pass their own (scripts/archive-cycle.ts). */
type Database = typeof prisma;
import { recordActivity } from "@/lib/activity-log";
import { confirmationMatches } from "@/lib/archive";

/** Archiving a cycle is confirmed by typing this word. */
export const ARCHIVE_CYCLE_WORD = "ARCHIVE";

export const CYCLE_ARCHIVED_ACTION = "REVIEW_CYCLE_ARCHIVED";
export const CYCLE_RESTORED_ACTION = "REVIEW_CYCLE_RESTORED";

export const ARCHIVED_DRAFT_MESSAGE =
  "This bulletin belongs to an archived cycle, so it can't be changed. Restore the cycle from the Archive first.";

/** Drafts that aren't in an archived cycle (drafts with no cycle count as live). */
export const NOT_IN_ARCHIVED_CYCLE: Prisma.SubmissionWhereInput = {
  OR: [{ cycleId: null }, { cycle: { archivedAt: null } }],
};

/** `where` narrowed to drafts outside archived cycles; safe with any keys, OR included. */
export function liveSubmissions(
  where: Prisma.SubmissionWhereInput = {},
): Prisma.SubmissionWhereInput {
  return { AND: [where, NOT_IN_ARCHIVED_CYCLE] };
}

/** True when the typed text is ARCHIVE (letter case and outer spaces ignored). */
export function archiveConfirmationMatches(typed: unknown): boolean {
  return confirmationMatches(typed, ARCHIVE_CYCLE_WORD);
}

/** True when the draft belongs to an archived cycle. */
export async function isSubmissionArchived(submissionId: string): Promise<boolean> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { cycle: { select: { archivedAt: true } } },
  });
  return Boolean(submission?.cycle?.archivedAt);
}

/**
 * The record ids whose log entries the activity log leaves out by default:
 * archived cycles and their drafts (comments and course edits are logged
 * against the draft).
 */
export async function archivedEntityIds(): Promise<string[]> {
  const cycles = await prisma.reviewCycle.findMany({
    where: { archivedAt: { not: null } },
    select: { id: true, submissions: { select: { id: true } } },
  });
  return cycles.flatMap((cycle) => [cycle.id, ...cycle.submissions.map((draft) => draft.id)]);
}

/**
 * Activity log filter for the default view: no entries about archived
 * records, except the archiving and restoring themselves.
 */
export function withoutArchivedEntries(ids: string[]): Prisma.ActivityLogWhereInput {
  if (ids.length === 0) return {};
  return {
    OR: [
      { entityId: null },
      { entityId: { notIn: ids } },
      { action: { in: [CYCLE_ARCHIVED_ACTION, CYCLE_RESTORED_ACTION] } },
    ],
  };
}

export type CycleArchiveSummary = {
  drafts: number;
  comments: number;
  transitions: number;
  logEntries: number;
};

/** What moves with the cycle: shown before archiving and after. */
export async function cycleArchiveSummary(
  cycleId: string,
  db: Database = prisma,
): Promise<CycleArchiveSummary> {
  const drafts = await db.submission.findMany({ where: { cycleId }, select: { id: true } });
  const draftIds = drafts.map((draft) => draft.id);
  const [comments, transitions, logEntries] = await Promise.all([
    db.comment.count({ where: { submission: { cycleId } } }),
    db.phaseTransition.count({ where: { submission: { cycleId } } }),
    db.activityLog.count({ where: { entityId: { in: [cycleId, ...draftIds] } } }),
  ]);
  return { drafts: draftIds.length, comments, transitions, logEntries };
}

function describeSummary(summary: CycleArchiveSummary): string {
  const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  return [
    plural(summary.drafts, "draft"),
    plural(summary.comments, "comment"),
    plural(summary.transitions, "workflow step"),
    plural(summary.logEntries, "log entry", "log entries"),
  ].join(", ");
}

export type ArchiveCycleResult =
  | { ok: true; summary: CycleArchiveSummary }
  | { ok: false; status: number; code: string; message: string };

/**
 * Closes the cycle, tags it TEST if asked, and archives it with everything
 * in it. Refuses a cycle already archived.
 */
export async function archiveCycle(
  input: { cycleId: string; actorId: string; isTest: boolean; now?: Date },
  db: Database = prisma,
): Promise<ArchiveCycleResult> {
  const now = input.now ?? new Date();
  const cycle = await db.reviewCycle.findUnique({ where: { id: input.cycleId } });
  if (!cycle) return { ok: false, status: 404, code: "NOT_FOUND", message: "Review cycle not found." };
  if (cycle.archivedAt) {
    return { ok: false, status: 409, code: "ALREADY_ARCHIVED", message: `${cycle.name} is already in the Archive.` };
  }

  const summary = await cycleArchiveSummary(cycle.id, db);
  await db.$transaction(async (tx) => {
    await tx.reviewCycle.update({
      where: { id: cycle.id },
      data: {
        isActive: false,
        closedAt: cycle.closedAt ?? now,
        isTest: input.isTest || cycle.isTest,
        archivedAt: now,
        archivedById: input.actorId,
      },
    });
    await recordActivity(
      {
        actorId: input.actorId,
        action: CYCLE_ARCHIVED_ACTION,
        entityType: "REVIEW_CYCLE",
        entityId: cycle.id,
        description:
          `Archived the ${cycle.name} review cycle${input.isTest || cycle.isTest ? ", tagged TEST" : ""}, ` +
          `with ${describeSummary(summary)}. It can be restored from the Archive.`,
        metadata: { ...summary, isTest: input.isTest || cycle.isTest, wasActive: cycle.isActive },
      },
      tx,
    );
  });
  return { ok: true, summary };
}

/**
 * Brings an archived cycle back, closed: its drafts show again and can be
 * edited once the cycle is reopened. The TEST tag stays.
 */
export async function restoreCycle(
  input: { cycleId: string; actorId: string },
  db: Database = prisma,
): Promise<ArchiveCycleResult> {
  const cycle = await db.reviewCycle.findUnique({ where: { id: input.cycleId } });
  if (!cycle) return { ok: false, status: 404, code: "NOT_FOUND", message: "Review cycle not found." };
  if (!cycle.archivedAt) {
    return { ok: false, status: 409, code: "NOT_ARCHIVED", message: `${cycle.name} isn't in the Archive.` };
  }

  const summary = await cycleArchiveSummary(cycle.id, db);
  await db.$transaction(async (tx) => {
    await tx.reviewCycle.update({
      where: { id: cycle.id },
      data: { archivedAt: null, archivedById: null },
    });
    await recordActivity(
      {
        actorId: input.actorId,
        action: CYCLE_RESTORED_ACTION,
        entityType: "REVIEW_CYCLE",
        entityId: cycle.id,
        description: `Restored the ${cycle.name} review cycle from the Archive, with ${describeSummary(summary)}. It stays closed until someone reopens it.`,
        metadata: { ...summary, isTest: cycle.isTest },
      },
      tx,
    );
  });
  return { ok: true, summary };
}

/** The 409 reply for any change to an archived cycle's draft, or null when it isn't archived. */
export async function refuseIfArchived(submissionId: string): Promise<NextResponse | null> {
  if (!(await isSubmissionArchived(submissionId))) return null;
  return NextResponse.json({ error: ARCHIVED_DRAFT_MESSAGE, code: "CYCLE_ARCHIVED" }, { status: 409 });
}
