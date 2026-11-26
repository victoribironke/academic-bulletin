/**
 * Rule W18 (programmes with options, R1): the B.Agric. programmes share 100
 * to 400 level and split into their options at 500 level. Each option is its
 * own programme with its own draft; the shared levels hold the same course
 * rows in every option's draft.
 *
 * - A change to a shared-level row in one option's draft is carried to the
 *   other options' drafts that the person can edit at this stage.
 * - sharedLevelDifferences() lists what differs (a draft that was at another
 *   desk when the change was made, or rows from before this rule), and
 *   alignSharedLevels() makes the other options match one draft.
 *
 * General Education rows are left alone: the General Education desk sets them
 * for every programme (W1). The families are in data/programmes/option-families.json.
 */
import type { CourseStatus, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import data from "@/data/programmes/option-families.json";
import { canWriteSubmission, type ApiUser } from "@/lib/api-auth";
import { recordActivity } from "@/lib/activity-log";
import { isGeneralEducationCourse } from "@/lib/courses/general-education";
import { startDescriptionFromRegistry } from "@/lib/courses/shared-courses";
import { applyCourseRowDelete, planCourseRowDelete } from "@/lib/courses/delete-course-rows";

export type OptionFamily = {
  name: string;
  sharedUpToLevel: number;
  source: string;
  programmes: { code: string; option: string }[];
};

export const OPTION_FAMILIES: OptionFamily[] = data.families;

export function familyFor(programmeCode: string | null | undefined): OptionFamily | null {
  if (!programmeCode) return null;
  const code = programmeCode.trim().toUpperCase();
  return OPTION_FAMILIES.find((family) => family.programmes.some((programme) => programme.code === code)) ?? null;
}

export function optionOf(family: OptionFamily, programmeCode: string): string {
  return family.programmes.find((programme) => programme.code === programmeCode.trim().toUpperCase())?.option ?? programmeCode;
}

export function isSharedLevel(family: OptionFamily, level: number): boolean {
  return level >= 100 && level <= family.sharedUpToLevel;
}

/** "100 to 400 level" */
export function sharedLevelsText(family: OptionFamily): string {
  return family.sharedUpToLevel === 100 ? "100 level" : `100 to ${family.sharedUpToLevel} level`;
}

export type OptionDraft = {
  submissionId: string;
  programmeCode: string;
  programmeName: string;
  option: string;
  status: string;
  currentPhase: number;
};

const draftSelect = {
  id: true,
  cycleId: true,
  status: true,
  currentPhase: true,
  programme: { select: { code: true, name: true } },
} satisfies Prisma.SubmissionSelect;

function asOptionDraft(family: OptionFamily, draft: Prisma.SubmissionGetPayload<{ select: typeof draftSelect }>): OptionDraft {
  return {
    submissionId: draft.id,
    programmeCode: draft.programme.code,
    programmeName: draft.programme.name,
    option: optionOf(family, draft.programme.code),
    status: draft.status,
    currentPhase: draft.currentPhase,
  };
}

/** This draft's option family and the other options' drafts in the same cycle. */
export async function optionDrafts(
  submissionId: string,
): Promise<{ family: OptionFamily; here: OptionDraft; others: OptionDraft[] } | null> {
  const draft = await prisma.submission.findUnique({ where: { id: submissionId }, select: draftSelect });
  const family = familyFor(draft?.programme.code);
  if (!draft || !family) return null;
  const otherCodes = family.programmes.map((programme) => programme.code).filter((code) => code !== draft.programme.code);
  const others = await prisma.submission.findMany({
    where: { id: { not: draft.id }, cycleId: draft.cycleId, programme: { code: { in: otherCodes } } },
    select: draftSelect,
    orderBy: { programme: { code: "asc" } },
  });
  return { family, here: asOptionDraft(family, draft), others: others.map((other) => asOptionDraft(family, other)) };
}

/** The parts of a course row the bulletin prints, which the options share. */
export type SharedRow = {
  code: string;
  title: string;
  units: number;
  status: CourseStatus;
  semester: number | null;
  level: number;
  prerequisites: string | null;
  masterCourseId: string | null;
  /** The Registry record, when the caller has its type and ownership. */
  masterCourse?: { type?: string; ownership?: string; [key: string]: unknown } | null;
};

/** W1: General Education rows stay the General Education desk's. */
function isGeneralEducationRow(row: { code: string; masterCourse?: { type?: string; ownership?: string } | null }): boolean {
  const master = row.masterCourse;
  return isGeneralEducationCourse({
    code: row.code,
    masterCourse: master?.type && master?.ownership ? { type: master.type, ownership: master.ownership } : null,
  });
}

const COMPARED = ["title", "units", "status", "semester", "level", "prerequisites"] as const;
type Compared = (typeof COMPARED)[number];

const FIELD_WORDS: Record<Compared | "code", string> = {
  code: "code",
  title: "title",
  units: "units",
  status: "core or elective",
  semester: "semester",
  level: "level",
  prerequisites: "prerequisites",
};

const rowSelect = {
  id: true,
  code: true,
  title: true,
  units: true,
  status: true,
  semester: true,
  level: true,
  prerequisites: true,
  masterCourseId: true,
  masterCourse: { select: { type: true, ownership: true } },
} satisfies Prisma.CourseSelect;

function sharedRowsOf(family: OptionFamily, rows: SharedRow[]): SharedRow[] {
  return rows.filter((row) => isSharedLevel(family, row.level) && !isGeneralEducationRow(row));
}

function differingFields(a: SharedRow, b: SharedRow): Compared[] {
  return COMPARED.filter((field) => (a[field] ?? null) !== (b[field] ?? null));
}

export type CarryResult = {
  family: string;
  /** The options whose drafts now have the change. */
  carried: string[];
  /** The options left as they were, and why. */
  skipped: { option: string; reason: string }[];
};

const CANNOT_EDIT = "its draft isn't open to you at this stage";

async function others(user: ApiUser, submissionId: string) {
  const context = await optionDrafts(submissionId);
  if (!context || context.others.length === 0) return null;
  const writable = await Promise.all(context.others.map((other) => canWriteSubmission(user, other.submissionId)));
  return { ...context, writable: context.others.map((other, index) => ({ other, canWrite: writable[index] })) };
}

function note(context: { family: OptionFamily; here: OptionDraft }, what: string) {
  return `${what} (carried from ${context.here.option}: ${sharedLevelsText(context.family)} is shared by the ${context.family.name} options, rule W18).`;
}

async function addRows(user: ApiUser, submissionId: string, rows: SharedRow[], context: { family: OptionFamily; here: OptionDraft }): Promise<number> {
  const existing = await prisma.course.findMany({ where: { submissionId }, select: { code: true, title: true } });
  const codes = new Set(existing.map((row) => row.code));
  const titles = new Set(existing.map((row) => row.title.toLowerCase()));
  let added = 0;
  for (const row of rows) {
    if (codes.has(row.code) || titles.has(row.title.toLowerCase())) continue;
    const course = await prisma.course.create({
      data: {
        submissionId,
        code: row.code,
        title: row.title,
        units: row.units,
        status: row.status,
        semester: row.semester,
        level: row.level,
        prerequisites: row.prerequisites,
        masterCourseId: row.masterCourseId,
      },
    });
    if (course.masterCourseId) {
      await startDescriptionFromRegistry(prisma, { id: course.id, title: course.title, submissionId, masterCourseId: course.masterCourseId });
    }
    codes.add(row.code);
    titles.add(row.title.toLowerCase());
    added += 1;
  }
  if (added > 0) {
    const names = rows.map((row) => row.code);
    await recordActivity({
      actorId: user.id,
      action: "COURSE_CREATED",
      entityType: "SUBMISSION",
      entityId: submissionId,
      description: note(context, added === 1 ? `Added ${names[0]}` : `Added ${added} courses`),
      metadata: { codes: names, carriedFrom: context.here.submissionId },
    });
  }
  return added;
}

/** After rows were added to a draft: add the shared-level ones to the other options. */
export async function carryAdded(user: ApiUser, submissionId: string, rows: SharedRow[]): Promise<CarryResult | null> {
  const context = await others(user, submissionId);
  if (!context) return null;
  const shared = sharedRowsOf(context.family, rows);
  if (shared.length === 0) return null;
  const result: CarryResult = { family: context.family.name, carried: [], skipped: [] };
  for (const { other, canWrite } of context.writable) {
    if (!canWrite) {
      result.skipped.push({ option: other.option, reason: CANNOT_EDIT });
      continue;
    }
    const added = await addRows(user, other.submissionId, shared, context);
    if (added > 0) result.carried.push(other.option);
  }
  return result;
}

/** After one row was changed: make the same change in the other options. */
export async function carryChanged(
  user: ApiUser,
  submissionId: string,
  before: SharedRow,
  after: SharedRow,
): Promise<CarryResult | null> {
  const context = await others(user, submissionId);
  if (!context || !isSharedLevel(context.family, before.level) || isGeneralEducationRow(before)) return null;
  const fields = [...differingFields(before, after), ...(before.code !== after.code ? (["code"] as const) : [])];
  if (fields.length === 0) return null;
  const result: CarryResult = { family: context.family.name, carried: [], skipped: [] };
  if (!isSharedLevel(context.family, after.level)) {
    for (const { other } of context.writable) {
      result.skipped.push({ option: other.option, reason: `${after.code} now sits at ${after.level} level, which is ${context.here.option}'s own` });
    }
    return result;
  }
  const data = Object.fromEntries(fields.map((field) => [field, after[field]])) as Prisma.CourseUpdateInput;
  for (const { other, canWrite } of context.writable) {
    if (!canWrite) {
      result.skipped.push({ option: other.option, reason: CANNOT_EDIT });
      continue;
    }
    const row = await prisma.course.findUnique({ where: { code_submissionId: { code: before.code, submissionId: other.submissionId } }, select: rowSelect });
    if (!row) {
      result.skipped.push({ option: other.option, reason: `its draft has no ${before.code}` });
      continue;
    }
    if (fields.every((field) => (row[field] ?? null) === (after[field] ?? null))) continue;
    try {
      await prisma.course.update({ where: { id: row.id }, data });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") {
        result.skipped.push({ option: other.option, reason: "another course in its draft already has that code or title" });
        continue;
      }
      throw error;
    }
    result.carried.push(other.option);
    await recordActivity({
      actorId: user.id,
      action: "COURSE_UPDATED",
      entityType: "SUBMISSION",
      entityId: other.submissionId,
      description: note(context, `Changed the ${fields.map((field) => FIELD_WORDS[field]).join(", ")} of ${before.code}`),
      metadata: { code: before.code, fields, carriedFrom: submissionId },
    });
  }
  return result;
}

/** After rows were removed: remove the shared-level ones from the other options (to the Archive). */
export async function carryRemoved(
  user: ApiUser,
  submissionId: string,
  rows: { code: string; level: number; masterCourse?: { type?: string; ownership?: string } | null }[],
): Promise<CarryResult | null> {
  const context = await others(user, submissionId);
  if (!context) return null;
  const codes = rows.filter((row) => isSharedLevel(context.family, row.level) && !isGeneralEducationRow(row)).map((row) => row.code);
  if (codes.length === 0) return null;
  const result: CarryResult = { family: context.family.name, carried: [], skipped: [] };
  for (const { other, canWrite } of context.writable) {
    if (!canWrite) {
      result.skipped.push({ option: other.option, reason: CANNOT_EDIT });
      continue;
    }
    const found = await prisma.course.findMany({ where: { submissionId: other.submissionId, code: { in: codes } }, select: { id: true } });
    if (found.length === 0) continue;
    const planned = await planCourseRowDelete(user, found.map((row) => row.id), other.submissionId);
    if (!planned.ok) {
      result.skipped.push({ option: other.option, reason: CANNOT_EDIT });
      continue;
    }
    await applyCourseRowDelete(planned.plan, user.id, note(context, "Removed with the same rows"));
    result.carried.push(other.option);
  }
  return result;
}

export type OptionDifference = {
  option: string;
  programmeName: string;
  submissionId: string;
  canEdit: boolean;
  /** In this draft's shared levels, not in theirs. */
  missing: string[];
  /** In theirs, not in this draft's. */
  extra: string[];
  /** In both, printed differently: the code and what differs. */
  changed: { code: string; fields: string[] }[];
};

export type SharedLevelsState = {
  family: string;
  option: string;
  sharedLevels: string;
  sharedUpToLevel: number;
  options: OptionDifference[];
};

/** How the other options' shared levels compare with this draft's. */
export async function sharedLevelDifferences(user: ApiUser, submissionId: string): Promise<SharedLevelsState | null> {
  const context = await optionDrafts(submissionId);
  if (!context) return null;
  const ids = [context.here.submissionId, ...context.others.map((other) => other.submissionId)];
  const rows = await prisma.course.findMany({
    where: { submissionId: { in: ids }, level: { gte: 100, lte: context.family.sharedUpToLevel } },
    select: { ...rowSelect, submissionId: true },
  });
  const byDraft = new Map<string, Map<string, SharedRow>>(ids.map((id) => [id, new Map()]));
  for (const row of rows) {
    if (isSharedLevel(context.family, row.level) && !isGeneralEducationRow(row)) byDraft.get(row.submissionId)!.set(row.code, row);
  }
  const here = byDraft.get(context.here.submissionId)!;
  const options = await Promise.all(
    context.others.map(async (other): Promise<OptionDifference> => {
      const there = byDraft.get(other.submissionId)!;
      return {
        option: other.option,
        programmeName: other.programmeName,
        submissionId: other.submissionId,
        canEdit: await canWriteSubmission(user, other.submissionId),
        missing: [...here.keys()].filter((code) => !there.has(code)).sort(),
        extra: [...there.keys()].filter((code) => !here.has(code)).sort(),
        changed: [...here.values()]
          .filter((row) => there.has(row.code))
          .map((row) => ({ code: row.code, fields: differingFields(row, there.get(row.code)!).map((field) => FIELD_WORDS[field]) }))
          .filter((row) => row.fields.length > 0)
          .sort((a, b) => a.code.localeCompare(b.code)),
      };
    }),
  );
  return { family: context.family.name, option: context.here.option, sharedLevels: sharedLevelsText(context.family), sharedUpToLevel: context.family.sharedUpToLevel, options };
}

export function hasDifferences(option: OptionDifference): boolean {
  return option.missing.length + option.extra.length + option.changed.length > 0;
}

/**
 * Makes every other option the person can edit match this draft's shared
 * levels: adds what's missing, changes what differs, and moves extra rows to
 * the Archive (they can be restored).
 */
export async function alignSharedLevels(user: ApiUser, submissionId: string): Promise<CarryResult | null> {
  const state = await sharedLevelDifferences(user, submissionId);
  const context = await optionDrafts(submissionId);
  if (!state || !context) return null;
  const hereRows = sharedRowsOf(
    context.family,
    await prisma.course.findMany({ where: { submissionId, level: { gte: 100, lte: context.family.sharedUpToLevel } }, select: rowSelect }),
  );
  const result: CarryResult = { family: context.family.name, carried: [], skipped: [] };
  for (const option of state.options.filter(hasDifferences)) {
    if (!option.canEdit) {
      result.skipped.push({ option: option.option, reason: CANNOT_EDIT });
      continue;
    }
    if (option.extra.length) {
      const found = await prisma.course.findMany({ where: { submissionId: option.submissionId, code: { in: option.extra } }, select: { id: true } });
      const planned = await planCourseRowDelete(user, found.map((row) => row.id), option.submissionId);
      if (planned.ok) await applyCourseRowDelete(planned.plan, user.id, note(context, `Matched to ${context.here.option}`));
    }
    for (const change of option.changed) {
      const source = hereRows.find((row) => row.code === change.code)!;
      try {
        await prisma.course.update({
          where: { code_submissionId: { code: change.code, submissionId: option.submissionId } },
          data: Object.fromEntries(COMPARED.map((field) => [field, source[field]])) as Prisma.CourseUpdateInput,
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
        result.skipped.push({ option: option.option, reason: `another course in its draft already has the title of ${change.code}` });
      }
    }
    await addRows(user, option.submissionId, hereRows.filter((row) => option.missing.includes(row.code)), context);
    if (option.changed.length) {
      await recordActivity({
        actorId: user.id,
        action: "COURSE_UPDATED",
        entityType: "SUBMISSION",
        entityId: option.submissionId,
        description: note(context, `Matched ${option.changed.length} course ${option.changed.length === 1 ? "row" : "rows"} to ${context.here.option}`),
        metadata: { codes: option.changed.map((row) => row.code), carriedFrom: submissionId },
      });
    }
    result.carried.push(option.option);
  }
  return result;
}

/** One line for the person who made the change: where it went, and where it didn't. */
export function carryMessage(result: CarryResult | null): string | null {
  if (!result) return null;
  const parts: string[] = [];
  if (result.carried.length) parts.push(`Also made in ${joinNames(result.carried)}, which share these levels.`);
  for (const skip of result.skipped) parts.push(`Not made in ${skip.option}: ${skip.reason}.`);
  return parts.length ? parts.join(" ") : null;
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
