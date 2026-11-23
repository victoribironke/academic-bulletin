/**
 * "Delete" for the records other records hang off: review cycles, schools,
 * departments, programmes, Registry courses and staff.
 *
 * 1. A record anything still uses can't be deleted; the reply says what uses it.
 * 2. The person types DELETE to confirm (work order Q7, Appendix D).
 * 3. The record is moved, whole, into the Archive (archived_records) instead of
 *    being erased, so an administrator can restore it with the same id.
 *
 * A page calls DELETE once without a body: 409 means the record is in use,
 * 400 CONFIRMATION_REQUIRED means it can go and says what to ask for.
 */
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";

export const ARCHIVABLE_TYPES = [
  "REVIEW_CYCLE",
  "SCHOOL",
  "DEPARTMENT",
  "PROGRAMME",
  "MASTER_COURSE",
  "STAFF",
] as const;
export type ArchivableType = (typeof ARCHIVABLE_TYPES)[number];

export const ARCHIVE_NOUNS: Record<ArchivableType, string> = {
  REVIEW_CYCLE: "review cycle",
  SCHOOL: "school",
  DEPARTMENT: "department",
  PROGRAMME: "programme",
  MASTER_COURSE: "Registry course",
  STAFF: "staff record",
};

// ---------------------------------------------------------------------------
// Typed confirmation (work order Q7, Appendix D)
// ---------------------------------------------------------------------------

/** Every delete is confirmed by typing this word. */
export const DELETE_CONFIRMATION_WORD = "DELETE";

/**
 * True when the typed text is DELETE, ignoring letter case and spaces at
 * either end. "delet" and "DELETED" don't match.
 */
export function deleteConfirmationMatches(typed: unknown): boolean {
  return typeof typed === "string" && typed.trim().toUpperCase() === DELETE_CONFIRMATION_WORD;
}

/**
 * For actions that aren't deletes but ask for a typed name, such as resetting
 * someone's two-step verification (their email): true when the text matches,
 * ignoring case and extra spaces.
 */
export function confirmationMatches(typed: unknown, expected: string): boolean {
  if (typeof typed !== "string") return false;
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalize(typed) !== "" && normalize(typed) === normalize(expected);
}

/** The `confirm` text from a DELETE request's JSON body, if it has one. */
export async function readConfirmation(request: Request): Promise<string | null> {
  const text = await request.text().catch(() => "");
  if (!text) return null;
  try {
    const body = JSON.parse(text) as { confirm?: unknown };
    return typeof body?.confirm === "string" ? body.confirm : null;
  } catch {
    return null;
  }
}

/**
 * Null when the request carries `confirm: "DELETE"`, otherwise the 400 reply
 * that tells the page to ask for it. The box on screen is never the only
 * safeguard: every delete route calls this.
 */
export async function requireDeleteConfirmation(
  request: Request,
  noun: string,
): Promise<NextResponse | null> {
  const typed = await readConfirmation(request);
  if (deleteConfirmationMatches(typed)) return null;
  return NextResponse.json(
    {
      error:
        typed === null
          ? `Type ${DELETE_CONFIRMATION_WORD} to confirm deleting this ${noun}.`
          : `That doesn't match. Type ${DELETE_CONFIRMATION_WORD} to confirm.`,
      code: "CONFIRMATION_REQUIRED",
      confirmText: DELETE_CONFIRMATION_WORD,
    },
    { status: 400 },
  );
}

/** The 409 reply for a record that something still uses. */
export function inUseResponse(noun: string, reasons: string[]): NextResponse {
  return NextResponse.json(
    {
      error: `This ${noun} is still in use, so it can't be deleted.`,
      code: "IN_USE",
      reasons,
    },
    { status: 409 },
  );
}

// ---------------------------------------------------------------------------
// What a record is used by
// ---------------------------------------------------------------------------

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Why the record can't be deleted yet; empty when nothing uses it. */
export async function deleteBlockers(
  type: ArchivableType,
  id: string,
): Promise<string[]> {
  const reasons: string[] = [];
  switch (type) {
    case "REVIEW_CYCLE": {
      const cycle = await prisma.reviewCycle.findUnique({
        where: { id },
        select: { isActive: true, _count: { select: { submissions: true } } },
      });
      if (!cycle) break;
      if (cycle.isActive) reasons.push("It is the active review cycle. Close it first.");
      if (cycle._count.submissions)
        reasons.push(`It has ${count(cycle._count.submissions, "bulletin")}.`);
      break;
    }
    case "SCHOOL": {
      const school = await prisma.school.findUnique({
        where: { id },
        select: { _count: { select: { departments: true, users: true, masterCourses: true } } },
      });
      if (!school) break;
      const { departments, users, masterCourses } = school._count;
      if (departments) reasons.push(`It has ${count(departments, "department")}.`);
      if (users) reasons.push(`${count(users, "user is", "users are")} assigned to it.`);
      if (masterCourses) reasons.push(`It owns ${count(masterCourses, "Registry course")}.`);
      break;
    }
    case "DEPARTMENT": {
      const department = await prisma.department.findUnique({
        where: { id },
        select: {
          _count: {
            select: { programmes: true, users: true, staff: true, masterCourses: true },
          },
        },
      });
      if (!department) break;
      const { programmes, users, staff, masterCourses } = department._count;
      if (programmes) reasons.push(`It has ${count(programmes, "programme")}.`);
      if (staff) reasons.push(`It has ${count(staff, "staff record")}.`);
      if (users) reasons.push(`${count(users, "user is", "users are")} assigned to it.`);
      if (masterCourses) reasons.push(`It owns ${count(masterCourses, "Registry course")}.`);
      break;
    }
    case "PROGRAMME": {
      const programme = await prisma.programme.findUnique({
        where: { id },
        select: {
          _count: {
            select: { submissions: true, programmeCourses: true, userAssignments: true },
          },
        },
      });
      if (!programme) break;
      const { submissions, programmeCourses, userAssignments } = programme._count;
      if (submissions) reasons.push(`It has ${count(submissions, "bulletin")}.`);
      if (programmeCourses)
        reasons.push(`${count(programmeCourses, "Registry course is", "Registry courses are")} linked to it.`);
      if (userAssignments)
        reasons.push(`${count(userAssignments, "user is", "users are")} assigned to it.`);
      break;
    }
    case "MASTER_COURSE": {
      const course = await prisma.masterCourse.findUnique({
        where: { id },
        select: {
          _count: {
            select: { programmeLinks: true, submissionCourses: true, prerequisiteOf: true },
          },
        },
      });
      if (!course) break;
      const { programmeLinks, submissionCourses, prerequisiteOf } = course._count;
      if (programmeLinks) reasons.push(`It is linked to ${count(programmeLinks, "programme")}.`);
      if (submissionCourses)
        reasons.push(`${count(submissionCourses, "bulletin uses", "bulletins use")} it.`);
      if (prerequisiteOf)
        reasons.push(
          `It is a prerequisite of ${count(prerequisiteOf, "other Registry course", "other Registry courses")}.`,
        );
      break;
    }
    case "STAFF":
      // Staff records hang off a department; nothing hangs off them.
      break;
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Archiving and restoring
// ---------------------------------------------------------------------------

/** Plain JSON for a row: dates become ISO strings. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Keeps a copy of the record in the Archive. Call it in the same transaction
 * that deletes the record. `data` is the record's own columns; a Registry
 * course also passes `prerequisiteIds`.
 */
export async function archiveRecord(
  tx: Prisma.TransactionClient,
  input: {
    entityType: ArchivableType;
    entityId: string;
    label: string;
    data: object;
    actorId: string;
  },
) {
  return tx.archivedRecord.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      label: input.label,
      data: toJson(input.data),
      archivedById: input.actorId,
    },
  });
}

type RestoreResult =
  | { ok: true; entityType: ArchivableType; entityId: string; label: string }
  | { ok: false; status: number; error: string };

function isArchivableType(value: string): value is ArchivableType {
  return (ARCHIVABLE_TYPES as readonly string[]).includes(value);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && error.code === code,
  );
}

/** What an archived parent was called, to name it in a message. */
async function archivedLabel(type: ArchivableType, id: string): Promise<string | null> {
  const record = await prisma.archivedRecord.findFirst({
    where: { entityType: type, entityId: id },
    orderBy: { archivedAt: "desc" },
    select: { label: true },
  });
  return record?.label ?? null;
}

/** A message when the record's parent is gone, so it can't come back yet. */
async function missingParent(
  type: ArchivableType,
  data: Record<string, unknown>,
): Promise<string | null> {
  const parentGone = async (parentType: ArchivableType, parentId: unknown) => {
    if (typeof parentId !== "string") return null;
    const exists =
      parentType === "SCHOOL"
        ? await prisma.school.count({ where: { id: parentId } })
        : await prisma.department.count({ where: { id: parentId } });
    if (exists) return null;
    const name = await archivedLabel(parentType, parentId);
    const noun = ARCHIVE_NOUNS[parentType];
    return name
      ? `Its ${noun}, ${name}, is in the Archive. Restore the ${noun} first.`
      : `Its ${noun} no longer exists, so it can't be restored.`;
  };

  switch (type) {
    case "DEPARTMENT":
      return parentGone("SCHOOL", data.schoolId);
    case "PROGRAMME":
    case "STAFF":
      return parentGone("DEPARTMENT", data.departmentId);
    case "MASTER_COURSE":
      return (
        (await parentGone("DEPARTMENT", data.ownerDeptId)) ??
        (await parentGone("SCHOOL", data.ownerSchoolId))
      );
    default:
      return null;
  }
}

/** The archived columns to recreate the record with, leaving out empty ones. */
function columns(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === "updatedAt" || key === "prerequisiteIds") continue;
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

async function recreate(
  tx: Prisma.TransactionClient,
  type: ArchivableType,
  data: Record<string, unknown>,
  actorId: string,
) {
  const values = columns(data);
  switch (type) {
    case "REVIEW_CYCLE": {
      // Only a closed cycle can be deleted, so it comes back closed.
      const creatorExists =
        typeof values.createdById === "string" &&
        (await tx.user.count({ where: { id: values.createdById } })) > 0;
      await tx.reviewCycle.create({
        data: {
          ...(values as Prisma.ReviewCycleUncheckedCreateInput),
          isActive: false,
          closedAt: (values.closedAt as string | undefined) ?? new Date(),
          createdById: creatorExists ? (values.createdById as string) : actorId,
        },
      });
      return;
    }
    case "SCHOOL":
      await tx.school.create({ data: values as Prisma.SchoolUncheckedCreateInput });
      return;
    case "DEPARTMENT":
      await tx.department.create({ data: values as Prisma.DepartmentUncheckedCreateInput });
      return;
    case "PROGRAMME":
      await tx.programme.create({ data: values as Prisma.ProgrammeUncheckedCreateInput });
      return;
    case "STAFF":
      await tx.staff.create({ data: values as Prisma.StaffUncheckedCreateInput });
      return;
    case "MASTER_COURSE": {
      const wanted = Array.isArray(data.prerequisiteIds)
        ? data.prerequisiteIds.filter((id): id is string => typeof id === "string")
        : [];
      // Prerequisites that were deleted since are left off.
      const present = wanted.length
        ? await tx.masterCourse.findMany({ where: { id: { in: wanted } }, select: { id: true } })
        : [];
      await tx.masterCourse.create({
        data: {
          ...(values as Prisma.MasterCourseUncheckedCreateInput),
          ...(present.length && { prerequisites: { connect: present } }),
        },
      });
      return;
    }
  }
}

/** Puts an archived record back with its original id. */
export async function restoreArchivedRecord(
  archiveId: string,
  actorId: string,
): Promise<RestoreResult> {
  const record = await prisma.archivedRecord.findUnique({ where: { id: archiveId } });
  if (!record) {
    return { ok: false, status: 404, error: "That record is no longer in the Archive." };
  }
  if (!isArchivableType(record.entityType)) {
    return { ok: false, status: 400, error: "This kind of record can't be restored." };
  }
  const type = record.entityType;
  const noun = ARCHIVE_NOUNS[type];
  const data = (record.data ?? {}) as Record<string, unknown>;

  const blocked = await missingParent(type, data);
  if (blocked) return { ok: false, status: 409, error: blocked };

  try {
    await prisma.$transaction(async (tx) => {
      await recreate(tx, type, data, actorId);
      await tx.archivedRecord.delete({ where: { id: archiveId } });
      await recordActivity(
        {
          actorId,
          action: `${type}_RESTORED`,
          entityType: type,
          entityId: record.entityId,
          description: `Restored the ${noun} ${record.label} from the Archive.`,
        },
        tx,
      );
    });
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) {
      return {
        ok: false,
        status: 409,
        error: `Another ${noun} now has the same name or code. Rename it, then restore this one.`,
      };
    }
    throw error;
  }

  return { ok: true, entityType: type, entityId: record.entityId, label: record.label };
}
