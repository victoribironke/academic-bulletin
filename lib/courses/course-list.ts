/**
 * Task B10: the Head of Department checks the programme's course list and
 * either confirms it or asks DAP for a change (add or remove a course, change
 * its units or semester). Change requests go to DAP's queue.
 *
 * A confirmation keeps a fingerprint of the list, so the draft shows when the
 * list changed after it was confirmed. Until the B10 migration has run on a
 * database, these tables don't exist: callers check isNotSwitchedOn and the
 * pages hide the panel instead of failing.
 */
import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";

export const CHANGE_KINDS = {
  ADD: "Add a course",
  REMOVE: "Remove a course",
  UNITS: "Change the units",
  SEMESTER: "Change the semester",
  OTHER: "Something else",
} as const;
export type ChangeKind = keyof typeof CHANGE_KINDS;
export const CHANGE_STATUSES = ["OPEN", "DONE", "DECLINED"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export const CHANGE_DETAILS_LENGTH = { min: 10, max: 1000 } as const;

export const NOT_SWITCHED_ON_MESSAGE =
  "Confirming the course list isn't switched on yet on this site (task B10 needs its database update).";

/** True for Prisma's "table does not exist" error (the B10 migration hasn't run). */
export function isNotSwitchedOn(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2021");
}

type Row = { code: string; units: number; semester: number | null; level: number; status: string };

/** The list as it stands: codes, units, semesters, levels and core or elective. */
export function courseListFingerprint(rows: Row[]): string {
  const lines = rows
    .map((row) => `${row.code}|${row.units}|${row.semester ?? "S"}|${row.level}|${row.status}`)
    .sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

async function currentRows(submissionId: string) {
  return prisma.course.findMany({
    where: { submissionId },
    select: { code: true, units: true, semester: true, level: true, status: true },
  });
}

const personName = (person: { firstName: string; lastName: string } | null) =>
  person ? `${person.firstName} ${person.lastName}`.trim() : null;

export type CourseListState = {
  confirmation: {
    confirmedAt: string;
    confirmedBy: string | null;
    courseCount: number;
    /** The list changed after it was confirmed. */
    changedSince: boolean;
  } | null;
  requests: {
    id: string;
    kind: ChangeKind;
    courseCode: string | null;
    details: string;
    status: ChangeStatus;
    response: string | null;
    requestedAt: string;
    requestedBy: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
  }[];
};

const requestSelect = {
  id: true,
  kind: true,
  courseCode: true,
  details: true,
  status: true,
  response: true,
  requestedAt: true,
  resolvedAt: true,
  requestedBy: { select: { firstName: true, lastName: true } },
  resolvedBy: { select: { firstName: true, lastName: true } },
} as const;

type LoadedRequest = {
  id: string;
  kind: string;
  courseCode: string | null;
  details: string;
  status: string;
  response: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  requestedBy: { firstName: string; lastName: string } | null;
  resolvedBy: { firstName: string; lastName: string } | null;
};

function requestView(request: LoadedRequest) {
  return {
    id: request.id,
    kind: request.kind as ChangeKind,
    courseCode: request.courseCode,
    details: request.details,
    status: request.status as ChangeStatus,
    response: request.response,
    requestedAt: request.requestedAt.toISOString(),
    requestedBy: personName(request.requestedBy),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
    resolvedBy: personName(request.resolvedBy),
  };
}

export async function getCourseListState(submissionId: string): Promise<CourseListState> {
  const [confirmation, requests, rows] = await Promise.all([
    prisma.courseListConfirmation.findUnique({
      where: { submissionId },
      select: {
        confirmedAt: true,
        courseCount: true,
        fingerprint: true,
        confirmedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.courseChangeRequest.findMany({
      where: { submissionId },
      orderBy: { requestedAt: "desc" },
      select: requestSelect,
    }),
    currentRows(submissionId),
  ]);
  return {
    confirmation: confirmation && {
      confirmedAt: confirmation.confirmedAt.toISOString(),
      confirmedBy: personName(confirmation.confirmedBy),
      courseCount: confirmation.courseCount,
      changedSince: confirmation.fingerprint !== courseListFingerprint(rows),
    },
    requests: requests.map(requestView),
  };
}

/** Records (or renews) the confirmation, with one log entry. */
export async function confirmCourseList(submissionId: string, actorId: string) {
  const rows = await currentRows(submissionId);
  const fingerprint = courseListFingerprint(rows);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.courseListConfirmation.upsert({
      where: { submissionId },
      create: { submissionId, confirmedById: actorId, confirmedAt: now, courseCount: rows.length, fingerprint },
      update: { confirmedById: actorId, confirmedAt: now, courseCount: rows.length, fingerprint },
    });
    await recordActivity(
      {
        actorId,
        action: "COURSE_LIST_CONFIRMED",
        entityType: "SUBMISSION",
        entityId: submissionId,
        description: `Confirmed the course list (${rows.length} courses).`,
        metadata: { courseCount: rows.length },
      },
      tx,
    );
  });
  return { confirmedAt: now.toISOString(), courseCount: rows.length };
}

/** What is wrong with a change request, or null when it can be sent. */
export function changeRequestProblem(input: { kind?: unknown; courseCode?: unknown; details?: unknown }): string | null {
  if (typeof input.kind !== "string" || !(input.kind in CHANGE_KINDS)) return "Choose what should change.";
  const details = typeof input.details === "string" ? input.details.trim() : "";
  if (details.length < CHANGE_DETAILS_LENGTH.min) {
    return `Say what should change, in at least ${CHANGE_DETAILS_LENGTH.min} characters.`;
  }
  if (details.length > CHANGE_DETAILS_LENGTH.max) return `Keep it under ${CHANGE_DETAILS_LENGTH.max} characters.`;
  if (input.kind !== "OTHER" && input.kind !== "ADD") {
    const code = typeof input.courseCode === "string" ? input.courseCode.trim() : "";
    if (!code) return "Say which course.";
  }
  return null;
}

export async function createChangeRequest(
  submissionId: string,
  actorId: string,
  input: { kind: ChangeKind; courseCode?: string | null; details: string },
) {
  const courseCode = input.courseCode?.trim().toUpperCase().replace(/\s+/g, " ") || null;
  const details = input.details.trim();
  return prisma.$transaction(async (tx) => {
    const created = await tx.courseChangeRequest.create({
      data: { submissionId, kind: input.kind, courseCode, details, requestedById: actorId },
      select: requestSelect,
    });
    await recordActivity(
      {
        actorId,
        action: "COURSE_CHANGE_REQUESTED",
        entityType: "SUBMISSION",
        entityId: submissionId,
        description: `Asked DAP to change the course list: ${CHANGE_KINDS[input.kind].toLowerCase()}${courseCode ? ` (${courseCode})` : ""}. ${details}`,
        metadata: { requestId: created.id, kind: input.kind, courseCode },
      },
      tx,
    );
    return requestView(created);
  });
}

/** DAP's queue: every request with its programme, newest first, open ones first. */
export async function listChangeRequests(status?: ChangeStatus) {
  const requests = await prisma.courseChangeRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ status: "desc" }, { requestedAt: "desc" }],
    take: 500,
    select: {
      ...requestSelect,
      submission: {
        select: {
          id: true,
          programme: { select: { name: true, code: true, department: { select: { name: true, code: true } } } },
        },
      },
    },
  });
  // Open requests first, each group newest first.
  return requests
    .map((request) => ({
      ...requestView(request),
      submissionId: request.submission.id,
      programme: request.submission.programme.name,
      programmeCode: request.submission.programme.code,
      department: request.submission.programme.department.name,
    }))
    .sort((a, b) => Number(b.status === "OPEN") - Number(a.status === "OPEN"));
}

export async function resolveChangeRequest(
  id: string,
  actorId: string,
  input: { status: ChangeStatus; response: string | null },
) {
  const existing = await prisma.courseChangeRequest.findUnique({ where: { id }, select: { id: true, submissionId: true, kind: true, courseCode: true } });
  if (!existing) return null;
  const reopened = input.status === "OPEN";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.courseChangeRequest.update({
      where: { id },
      data: {
        status: input.status,
        response: input.response,
        resolvedById: reopened ? null : actorId,
        resolvedAt: reopened ? null : new Date(),
      },
      select: requestSelect,
    });
    const word = input.status === "DONE" ? "Done" : input.status === "DECLINED" ? "Declined" : "Reopened";
    await recordActivity(
      {
        actorId,
        action: "COURSE_CHANGE_RESOLVED",
        entityType: "SUBMISSION",
        entityId: existing.submissionId,
        description: `${word}: the request to ${CHANGE_KINDS[existing.kind as ChangeKind]?.toLowerCase() ?? "change the course list"}${existing.courseCode ? ` (${existing.courseCode})` : ""}.${input.response ? ` ${input.response}` : ""}`,
        metadata: { requestId: id, status: input.status },
      },
      tx,
    );
    return requestView(updated);
  });
}

/**
 * Which of these drafts have their course list confirmed and unchanged since
 * (G5: a pre-filled list counts as done only then). Empty where the B10
 * tables don't exist yet.
 */
export async function confirmedCourseLists(
  drafts: { id: string; courses: Row[] }[],
): Promise<Set<string>> {
  if (drafts.length === 0) return new Set();
  try {
    const confirmations = await prisma.courseListConfirmation.findMany({
      where: { submissionId: { in: drafts.map((draft) => draft.id) } },
      select: { submissionId: true, fingerprint: true },
    });
    const byDraft = new Map(confirmations.map((item) => [item.submissionId, item.fingerprint]));
    return new Set(
      drafts
        .filter((draft) => draft.courses.length > 0 && byDraft.get(draft.id) === courseListFingerprint(draft.courses))
        .map((draft) => draft.id),
    );
  } catch (error) {
    if (isNotSwitchedOn(error)) return new Set();
    throw error;
  }
}

