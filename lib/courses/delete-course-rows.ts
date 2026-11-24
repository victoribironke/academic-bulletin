/**
 * Deleting course rows from a programme's draft, one or several at once
 * (work order Q7, Appendix D):
 *
 * - the person may edit the draft, and only administrators remove the
 *   General Education block (W1);
 * - the route checks DELETE was typed, and a reason when the person doesn't
 *   own the department's draft;
 * - each row goes to the Archive with its course description, so it can be
 *   restored for the life of the cycle;
 * - one activity log entry says who deleted what, where and how many;
 * - a Registry course the department removed stays removed (G6).
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { archiveRecord } from "@/lib/archive";
import { deleteNeedsReason } from "@/lib/delete-reason";
import { isAdministrator, requireSubmissionWriteAccess, type ApiUser } from "@/lib/api-auth";
import {
  GENERAL_EDUCATION_LOCKED_MESSAGE,
  isGeneralEducationCourse,
} from "@/lib/courses/general-education";

/** More than a level's worth of rows, so one save never splits. */
export const MAX_COURSE_ROWS_PER_DELETE = 300;

const rowSelect = {
  id: true,
  code: true,
  title: true,
  units: true,
  status: true,
  semester: true,
  level: true,
  prerequisites: true,
  createdAt: true,
  updatedAt: true,
  submissionId: true,
  masterCourseId: true,
  masterCourse: { select: { type: true, ownership: true } },
  description: {
    select: {
      id: true,
      learningOutcomes: true,
      courseContent: true,
      labWork: true,
      entrepreneurialAspect: true,
      gracePass: true,
      graceResult: true,
      graceStatus: true,
      graceContentHash: true,
      graceCheckedAt: true,
      createdAt: true,
    },
  },
} as const;

export type CourseRowDeletePlan = {
  submissionId: string;
  programmeName: string;
  /** True when the person doesn't own the department's draft (Appendix D). */
  needsReason: boolean;
  rows: Awaited<ReturnType<typeof loadRows>>;
};

function loadRows(ids: string[]) {
  return prisma.course.findMany({ where: { id: { in: ids } }, select: rowSelect, orderBy: [{ level: "asc" }, { code: "asc" }] });
}

/** The ids sent, cleaned: strings only, each once. */
export function courseRowIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

/**
 * Checks the rows can go, before the DELETE word and the reason are checked.
 * Rows already gone are left out; none left is a 404.
 */
export async function planCourseRowDelete(
  user: ApiUser | null,
  ids: string[],
  submissionId?: string,
): Promise<{ ok: true; plan: CourseRowDeletePlan } | { ok: false; response: NextResponse }> {
  const fail = (status: number, body: object) => ({ ok: false as const, response: NextResponse.json(body, { status }) });
  if (ids.length === 0) return fail(400, { error: "Choose at least one course row to delete." });
  if (ids.length > MAX_COURSE_ROWS_PER_DELETE) {
    return fail(400, { error: `Delete at most ${MAX_COURSE_ROWS_PER_DELETE} course rows at a time.` });
  }

  const rows = await loadRows(ids);
  if (rows.length === 0) return fail(404, { error: "Course not found" });
  const draftId = submissionId ?? rows[0].submissionId;
  if (rows.some((row) => row.submissionId !== draftId)) {
    return fail(400, { error: "These course rows belong to different drafts. Delete them one draft at a time." });
  }

  const gate = await requireSubmissionWriteAccess(user, draftId);
  if (!gate.ok) return fail(gate.status, { error: gate.message });

  // W1: a department can't remove the General Education block.
  if (!isAdministrator(user!) && rows.some((row) => isGeneralEducationCourse(row))) {
    return fail(403, { error: GENERAL_EDUCATION_LOCKED_MESSAGE, code: "GENERAL_EDUCATION_LOCKED" });
  }

  const draft = await prisma.submission.findUniqueOrThrow({
    where: { id: draftId },
    select: { programme: { select: { name: true, departmentId: true } } },
  });
  return {
    ok: true,
    plan: {
      submissionId: draftId,
      programmeName: draft.programme.name,
      needsReason: deleteNeedsReason(user!, draft.programme.departmentId),
      rows,
    },
  };
}

/** Archives and deletes the planned rows, in one transaction, with one log entry. */
export async function applyCourseRowDelete(
  plan: CourseRowDeletePlan,
  actorId: string,
  reason: string | null,
): Promise<{ deleted: number }> {
  const { rows, submissionId, programmeName } = plan;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const { masterCourse: _registry, ...data } = row;
      void _registry;
      await archiveRecord(tx, {
        entityType: "COURSE_ROW",
        entityId: row.id,
        label: `${row.code} ${row.title} (${programmeName})`,
        data,
        actorId,
      });
    }
    await tx.course.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });

    // G6: a Registry course the department removed stays removed when the
    // Registry is uploaded again. (General Education always comes back.)
    const dismissed = rows
      .filter((row) => row.masterCourseId && !isGeneralEducationCourse(row))
      .map((row) => row.masterCourseId as string);
    if (dismissed.length) {
      const draft = await tx.submission.findUniqueOrThrow({
        where: { id: submissionId },
        select: { dismissedRegistryCourseIds: true },
      });
      const added = dismissed.filter((id) => !draft.dismissedRegistryCourseIds.includes(id));
      if (added.length) {
        await tx.submission.update({
          where: { id: submissionId },
          data: { dismissedRegistryCourseIds: { push: added } },
        });
      }
    }

    const names = rows.map((row) => row.code);
    const what =
      rows.length === 1
        ? `Deleted ${rows[0].code} - ${rows[0].title} from ${programmeName}.`
        : `Deleted ${rows.length} course rows from ${programmeName}: ${names.slice(0, 10).join(", ")}${names.length > 10 ? ` and ${names.length - 10} more` : ""}.`;
    await recordActivity(
      {
        actorId,
        action: "COURSE_DELETED",
        entityType: "SUBMISSION",
        entityId: submissionId,
        description: `${what} ${rows.length === 1 ? "It" : "They"} can be restored from the Archive.${reason ? ` Reason: ${reason}` : ""}`,
        metadata: {
          count: rows.length,
          ...(rows.length === 1 && { courseId: rows[0].id }),
          courseIds: rows.map((row) => row.id),
          codes: names,
          ...(reason && { reason }),
        },
      },
      tx,
    );
  });
  return { deleted: rows.length };
}
