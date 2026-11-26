/**
 * Task B3: one course code format ("GST 112", "BU-GST 112").
 *
 * - A Registry course whose code isn't in the format is renamed to it.
 * - Courses whose codes become the same are merged only when their titles
 *   and units match: programme links, draft rows, prerequisites and "removed"
 *   marks move to the course kept, and the other goes to the Archive.
 * - Where the titles or units differ, nothing changes: the group goes to DAP
 *   in the merge report to decide. DAP's decisions can then be passed in:
 *   merge one exact code into another (the kept course's title and units
 *   stay), or archive an exact code or the heading rows, which is refused for
 *   a record any programme or draft uses.
 * - Course rows in the current drafts get the tidied code too.
 *
 * planCodeCleanup writes nothing; applyCodeCleanup runs the plan in one
 * transaction. The script (scripts/clean-course-codes.ts) writes only with
 * --confirm DELETE, because merging removes the duplicate records.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { archiveRecord } from "@/lib/archive";
import { titleKey } from "@/lib/courses/unique-title";
import { courseCodeKey } from "@/lib/courses/code-key";

export { courseCodeKey };
import { COURSE_CODE_PATTERN, formatCourseCode } from "@/lib/validation/name-format";

type Db = PrismaClient | typeof prisma;


export type RegistryCourseSummary = {
  id: string;
  code: string;
  title: string;
  units: number;
  semester: number | null;
  owner: string;
  programmeLinks: number;
  draftRows: number;
};

export type CodeRename = RegistryCourseSummary & { to: string };
export type CodeMerge = {
  code: string;
  keep: RegistryCourseSummary;
  merge: RegistryCourseSummary[];
  /** Fields that differ besides title and units; the kept course's values stay. */
  otherDifferences: string[];
};
export type CodeGroupForDap = { code: string; why: string; courses: RegistryCourseSummary[] };
/** DAP's decisions on the groups it was asked about (exact codes as they stand). */
export type CodeCleanupDecisions = {
  merges?: { from: string; into: string }[];
  archive?: string[];
  archiveHeadings?: boolean;
};
export type CodeArchive = RegistryCourseSummary & { why: string };
export type DraftRowRename = { id: string; submissionId: string; programme: string; from: string; to: string };
export type DraftRowClash = { submissionId: string; programme: string; code: string; rows: string[] };

export type CodeCleanupPlan = {
  registryCourses: number;
  renames: CodeRename[];
  merges: CodeMerge[];
  forDap: CodeGroupForDap[];
  /** Codes that can't be put in the format at all (left for DAP). */
  untidyable: RegistryCourseSummary[];
  /** Records whose "code" is a heading such as LEVEL 200 (left for DAP). */
  headings: RegistryCourseSummary[];
  draftRenames: DraftRowRename[];
  /** A draft that already has the tidied code on another row. */
  draftClashes: DraftRowClash[];
  /** Records DAP decided to archive (unused copies, heading rows). */
  archives: CodeArchive[];
  /** DAP decisions that couldn't be applied, and why. */
  decisionProblems: string[];
};

const summarySelect = {
  id: true,
  code: true,
  title: true,
  units: true,
  semester: true,
  type: true,
  ownership: true,
  level: true,
  createdAt: true,
  ownerDepartment: { select: { code: true } },
  ownerSchool: { select: { code: true } },
  _count: { select: { programmeLinks: true, submissionCourses: true } },
} as const;

type LoadedCourse = Prisma.MasterCourseGetPayload<{ select: typeof summarySelect }>;

function summarize(course: LoadedCourse): RegistryCourseSummary {
  return {
    id: course.id,
    code: course.code,
    title: course.title,
    units: course.units,
    semester: course.semester,
    owner: course.ownerDepartment?.code ?? course.ownerSchool?.code ?? course.ownership,
    programmeLinks: course._count.programmeLinks,
    draftRows: course._count.submissionCourses,
  };
}

const inFormat = (code: string) => COURSE_CODE_PATTERN.test(code);
/** "LEVEL 200" and the like: spreadsheet headings imported as courses. */
const HEADING_PREFIX = /^(LEVEL|YEAR|PART|SEM|TOTAL)\b/i;

/** Titles compared for a merge: letter case, punctuation and "&" for "and" don't count. */
export function comparableTitle(title: string): string {
  return titleKey(title).replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The course a merge keeps: the one already in the format, then the most used, then the oldest. */
function pickKeeper(courses: LoadedCourse[], code: string): LoadedCourse {
  return [...courses].sort(
    (a, b) =>
      Number(b.code === code) - Number(a.code === code) ||
      b._count.programmeLinks - a._count.programmeLinks ||
      b._count.submissionCourses - a._count.submissionCourses ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  )[0];
}

function otherDifferences(courses: LoadedCourse[]): string[] {
  const differs = (label: string, values: unknown[]) =>
    new Set(values.map((value) => JSON.stringify(value ?? null))).size > 1 ? [label] : [];
  return [
    ...differs("semester", courses.map((course) => course.semester)),
    ...differs("type", courses.map((course) => course.type)),
    ...differs("owner", courses.map((course) => summarize(course).owner)),
  ];
}

/** Works out the clean-up without writing anything. */
export async function planCodeCleanup(db: Db = prisma, decisions: CodeCleanupDecisions = {}): Promise<CodeCleanupPlan> {
  const courses = await db.masterCourse.findMany({ select: summarySelect, orderBy: { code: "asc" } });
  const archives: CodeArchive[] = [];
  const decisionProblems: string[] = [];
  const unused = (course: LoadedCourse) => course._count.programmeLinks === 0 && course._count.submissionCourses === 0;
  const toArchive = new Set((decisions.archive ?? []).map((code) => code.trim()));
  const mergeDecisions = new Map((decisions.merges ?? []).map((merge) => [merge.from.trim(), merge.into.trim()]));
  const usedDecisions = new Set<string>();

  const groups = new Map<string, LoadedCourse[]>();
  const untidyable: RegistryCourseSummary[] = [];
  const headings: RegistryCourseSummary[] = [];
  for (const course of courses) {
    if (HEADING_PREFIX.test(course.code.trim())) {
      if (decisions.archiveHeadings && unused(course)) {
        archives.push({ ...summarize(course), why: "A spreadsheet heading imported as a course; nothing uses it." });
      } else {
        if (decisions.archiveHeadings) decisionProblems.push(`${course.code} ${course.title} is a heading row, but a programme or draft uses it; left as it is.`);
        headings.push(summarize(course));
      }
      continue;
    }
    if (!inFormat(formatCourseCode(course.code))) {
      untidyable.push(summarize(course));
      continue;
    }
    const key = courseCodeKey(course.code);
    groups.set(key, [...(groups.get(key) ?? []), course]);
  }

  const renames: CodeRename[] = [];
  const merges: CodeMerge[] = [];
  const forDap: CodeGroupForDap[] = [];
  for (const group of groups.values()) {
    const forms = new Set(group.map((course) => formatCourseCode(course.code)));
    if (group.length === 1) {
      const [course] = group;
      const to = formatCourseCode(course.code);
      if (to !== course.code) renames.push({ ...summarize(course), to });
      continue;
    }
    const code = [...forms][0];
    if (forms.size > 1) {
      forDap.push({ code: [...forms].join(" / "), why: "The codes differ only by a hyphen.", courses: group.map(summarize) });
      continue;
    }
    const sameTitle = new Set(group.map((course) => comparableTitle(course.title))).size === 1;
    const sameUnits = new Set(group.map((course) => course.units)).size === 1;
    if (!sameTitle || !sameUnits) {
      // DAP's decisions for this group: archive unused copies, merge one into another.
      let rest = group;
      for (const course of group) {
        if (!toArchive.has(course.code)) continue;
        usedDecisions.add(course.code);
        if (!unused(course)) {
          decisionProblems.push(`${course.code} ${course.title} is used by ${course._count.programmeLinks} programmes and ${course._count.submissionCourses} draft rows, so it wasn't archived.`);
          continue;
        }
        archives.push({ ...summarize(course), why: `An unused second course with the code ${code}; DAP decided to archive it.` });
        rest = rest.filter((item) => item.id !== course.id);
      }
      const merging = rest.filter((course) => mergeDecisions.has(course.code));
      for (const course of merging) {
        usedDecisions.add(course.code);
        const keep = rest.find((item) => item.code === mergeDecisions.get(course.code));
        if (!keep || keep.id === course.id) {
          decisionProblems.push(`${course.code} was to merge into ${mergeDecisions.get(course.code)}, which isn't in its group; left as it is.`);
          continue;
        }
        merges.push({
          code,
          keep: summarize(keep),
          merge: [summarize(course)],
          otherDifferences: [comparableTitle(keep.title) !== comparableTitle(course.title) && "title", keep.units !== course.units && "units"].filter(
            (field): field is string => Boolean(field),
          ),
        });
        rest = rest.filter((item) => item.id !== course.id);
      }
      if (rest.length === 1) {
        const [course] = rest;
        if (course.code !== code && !merges.some((merge) => merge.keep.id === course.id)) renames.push({ ...summarize(course), to: code });
        continue;
      }
      if (rest.length < group.length && !merges.some((merge) => rest.some((item) => item.id === merge.keep.id))) {
        decisionProblems.push(`${code}: ${rest.length} courses still share the code after DAP's decisions.`);
      }
      if (rest.length === 0 || (rest.length === 1 && merges.some((merge) => merge.keep.id === rest[0].id))) continue;
      forDap.push({
        code,
        why: [!sameTitle && "the titles differ", !sameUnits && "the units differ"].filter(Boolean).join(" and ").replace(/^./, (c) => c.toUpperCase()) + ".",
        courses: group.map(summarize),
      });
      continue;
    }
    const keep = pickKeeper(group, code);
    merges.push({
      code,
      keep: summarize(keep),
      merge: group.filter((course) => course.id !== keep.id).map(summarize),
      otherDifferences: otherDifferences(group),
    });
  }

  for (const code of [...toArchive, ...mergeDecisions.keys()]) {
    if (!usedDecisions.has(code)) decisionProblems.push(`${code} was in DAP's decisions but isn't in a group to decide; nothing changed for it.`);
  }

  // Course rows in the current drafts (archived cycles stay as they were).
  const rows = await db.course.findMany({
    where: { submission: { cycle: { archivedAt: null } } },
    select: { id: true, code: true, submissionId: true, submission: { select: { programme: { select: { name: true } } } } },
  });
  const codesByDraft = new Map<string, Map<string, string[]>>();
  for (const row of rows) {
    const byCode = codesByDraft.get(row.submissionId) ?? new Map<string, string[]>();
    const key = courseCodeKey(row.code);
    byCode.set(key, [...(byCode.get(key) ?? []), row.code]);
    codesByDraft.set(row.submissionId, byCode);
  }
  const draftRenames: DraftRowRename[] = [];
  const clashes = new Map<string, DraftRowClash>();
  for (const row of rows) {
    const to = formatCourseCode(row.code);
    if (to === row.code || !inFormat(to)) continue;
    const programme = row.submission.programme.name;
    const sameKey = codesByDraft.get(row.submissionId)!.get(courseCodeKey(row.code))!;
    if (sameKey.length > 1) {
      clashes.set(`${row.submissionId} ${to}`, { submissionId: row.submissionId, programme, code: to, rows: sameKey });
      continue;
    }
    draftRenames.push({ id: row.id, submissionId: row.submissionId, programme, from: row.code, to });
  }

  return {
    registryCourses: courses.length,
    renames,
    merges,
    forDap,
    untidyable,
    headings,
    draftRenames,
    draftClashes: [...clashes.values()],
    archives,
    decisionProblems,
  };
}

export function planHasChanges(plan: CodeCleanupPlan): boolean {
  return plan.renames.length + plan.merges.length + plan.draftRenames.length + plan.archives.length > 0;
}

const FILLABLE = [
  "description",
  "learningOutcomes",
  "courseContent",
  "labWork",
  "entrepreneurialAspect",
  "curriculumSource",
  "sourceReference",
] as const;
const LINK_OVERRIDES = [
  "titleOverride",
  "unitsOverride",
  "typeOverride",
  "semesterOverride",
  "levelOverride",
  "learningOutcomesOverride",
  "courseContentOverride",
  "sourceProgrammeName",
  "sourceReference",
] as const;
const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

/** Moves everything from `fromId` onto `keepId`, archives `fromId` and deletes it. */
async function mergeInto(tx: Prisma.TransactionClient, keepId: string, fromId: string, code: string, actorId: string) {
  // One query at a time: a transaction has a single connection.
  const keep = await tx.masterCourse.findUniqueOrThrow({ where: { id: keepId }, include: { programmeLinks: true } });
  const from = await tx.masterCourse.findUniqueOrThrow({
    where: { id: fromId },
    include: { programmeLinks: true, prerequisites: { select: { id: true } }, prerequisiteOf: { select: { id: true } } },
  });

  // Programme links: move them, or fold their overrides into the kept link.
  const keptLinks = new Map(keep.programmeLinks.map((link) => [link.programmeId, link]));
  for (const link of from.programmeLinks) {
    const kept = keptLinks.get(link.programmeId);
    if (!kept) {
      await tx.programmeCourse.update({ where: { id: link.id }, data: { courseId: keepId } });
      continue;
    }
    const fill: Record<string, unknown> = {};
    for (const field of LINK_OVERRIDES) {
      if (isEmpty(kept[field]) && !isEmpty(link[field])) fill[field] = link[field];
    }
    if (Object.keys(fill).length) {
      await tx.programmeCourse.update({ where: { id: kept.id }, data: fill as Prisma.ProgrammeCourseUpdateInput });
    }
    await tx.programmeCourse.delete({ where: { id: link.id } });
  }

  // Draft rows now point at the kept course.
  await tx.course.updateMany({ where: { masterCourseId: fromId }, data: { masterCourseId: keepId } });

  // Prerequisites, both ways.
  const prerequisites = from.prerequisites.map(({ id }) => id).filter((id) => id !== keepId);
  if (prerequisites.length) {
    await tx.masterCourse.update({
      where: { id: keepId },
      data: { prerequisites: { connect: prerequisites.map((id) => ({ id })) } },
    });
  }
  for (const { id } of from.prerequisiteOf) {
    if (id === keepId) continue;
    await tx.masterCourse.update({
      where: { id },
      data: { prerequisites: { disconnect: { id: fromId }, connect: { id: keepId } } },
    });
  }

  // G6 "removed" marks follow the course.
  const marked = await tx.submission.findMany({
    where: { dismissedRegistryCourseIds: { has: fromId } },
    select: { id: true, dismissedRegistryCourseIds: true },
  });
  for (const draft of marked) {
    const next = [...new Set(draft.dismissedRegistryCourseIds.map((id) => (id === fromId ? keepId : id)))];
    await tx.submission.update({ where: { id: draft.id }, data: { dismissedRegistryCourseIds: next } });
  }

  // Text the kept course lacks comes from the merged one.
  const fill: Record<string, unknown> = {};
  for (const field of FILLABLE) {
    if (isEmpty(keep[field]) && !isEmpty(from[field])) fill[field] = from[field];
  }
  if (Object.keys(fill).length) {
    await tx.masterCourse.update({ where: { id: keepId }, data: fill as Prisma.MasterCourseUpdateInput });
  }

  const { programmeLinks: _links, prerequisites: _pre, prerequisiteOf: _of, ...record } = from;
  void _links;
  void _of;
  await archiveRecord(tx, {
    entityType: "MASTER_COURSE",
    entityId: fromId,
    label: `${from.code} ${from.title} (merged into ${code})`,
    data: { ...record, prerequisiteIds: _pre.map(({ id }) => id) },
    actorId,
  });
  await tx.masterCourse.delete({ where: { id: fromId } });
}

/** Archives a Registry course nothing uses (DAP's decision), then deletes it. */
async function archiveUnused(tx: Prisma.TransactionClient, course: CodeArchive, actorId: string) {
  const record = await tx.masterCourse.findUniqueOrThrow({
    where: { id: course.id },
    include: { prerequisites: { select: { id: true } }, _count: { select: { programmeLinks: true, submissionCourses: true } } },
  });
  // Checked again inside the transaction: something may have started using it.
  if (record._count.programmeLinks + record._count.submissionCourses > 0) {
    throw new Error(`${record.code} ${record.title} is in use now; nothing was changed.`);
  }
  const { prerequisites, _count, ...data } = record;
  void _count;
  await archiveRecord(tx, {
    entityType: "MASTER_COURSE",
    entityId: record.id,
    label: `${record.code} ${record.title} (B3: ${course.why})`,
    data: { ...data, prerequisiteIds: prerequisites.map(({ id }) => id) },
    actorId,
  });
  await tx.masterCourse.delete({ where: { id: record.id } });
}

/** Runs the plan in one transaction, with one activity log entry. */
export async function applyCodeCleanup(
  plan: CodeCleanupPlan,
  options: { actorId: string },
  db: Db = prisma,
): Promise<{ renamed: number; merged: number; draftRowsRenamed: number; archived: number }> {
  let merged = 0;
  await db.$transaction(
    async (tx) => {
      for (const course of plan.archives) await archiveUnused(tx, course, options.actorId);
      for (const merge of plan.merges) {
        for (const course of merge.merge) {
          await mergeInto(tx, merge.keep.id, course.id, merge.code, options.actorId);
          merged += 1;
        }
        if (merge.keep.code !== merge.code) {
          await tx.masterCourse.update({ where: { id: merge.keep.id }, data: { code: merge.code } });
        }
      }
      for (const rename of plan.renames) {
        await tx.masterCourse.update({ where: { id: rename.id }, data: { code: rename.to } });
      }
      for (const row of plan.draftRenames) {
        await tx.course.update({ where: { id: row.id }, data: { code: row.to } });
      }
      await recordActivity(
        {
          actorId: options.actorId,
          action: "COURSE_CODES_CLEANED",
          entityType: "MASTER_COURSE",
          entityId: "registry",
          description: `Put course codes in the standard format (B3): ${plan.renames.length} Registry codes tidied, ${merged} duplicate Registry courses merged into ${plan.merges.length}, ${plan.draftRenames.length} draft rows tidied${plan.archives.length ? `, ${plan.archives.length} unused records archived on DAP's decision` : ""}. ${plan.forDap.length} groups left for DAP to decide. Merged and archived courses are in the Archive.`,
          metadata: {
            renamed: plan.renames.length,
            merged,
            groups: plan.merges.length,
            draftRowsRenamed: plan.draftRenames.length,
            forDap: plan.forDap.map((group) => group.code),
            archived: plan.archives.map((course) => course.code),
          },
        },
        tx,
      );
    },
    { timeout: 10 * 60_000, maxWait: 30_000 },
  );
  return { renamed: plan.renames.length, merged, draftRowsRenamed: plan.draftRenames.length, archived: plan.archives.length };
}

/** The merge report for DAP, as Markdown. */
export function codeCleanupReport(plan: CodeCleanupPlan, heading: string): string {
  const line = (course: RegistryCourseSummary) =>
    `| ${course.code} | ${course.title} | ${course.units} | ${course.semester ?? "sessional"} | ${course.owner} | ${course.programmeLinks} | ${course.draftRows} |`;
  const header =
    "| Code now | Title | Units | Semester | Owner | Programmes | Draft rows |\n|---|---|---|---|---|---|---|";
  const out: string[] = [
    `# ${heading}`,
    "",
    `- Registry courses: ${String(plan.registryCourses).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`,
    `- Codes to tidy (no duplicate): ${plan.renames.length}`,
    `- Duplicate groups to merge (same title and units): ${plan.merges.length}, removing ${plan.merges.reduce((sum, merge) => sum + merge.merge.length, 0)} records`,
    `- Groups for DAP to decide (titles or units differ): ${plan.forDap.length}`,
    `- Codes that can't be put in the format: ${plan.untidyable.length}; headings imported as courses: ${plan.headings.length}`,
    `- Draft course rows to tidy: ${plan.draftRenames.length}; drafts with the same code twice: ${plan.draftClashes.length}`,
    ...(plan.archives.length ? [`- Unused records archived on DAP's decision: ${plan.archives.length}`] : []),
    ...(plan.decisionProblems.length ? [`- DAP decisions that couldn't be applied: ${plan.decisionProblems.length}`] : []),
    "",
    ...(plan.decisionProblems.length ? ["## DAP decisions that couldn't be applied", "", ...plan.decisionProblems.map((problem) => `- ${problem}`), ""] : []),
    ...(plan.archives.length
      ? [
          "## Archived on DAP's decision",
          "",
          "Unused records (no programme, no draft row). Each goes to the Archive and can be restored.",
          "",
          "| Code | Title | Units | Why |",
          "|---|---|---|---|",
          ...plan.archives.map((course) => `| ${course.code} | ${course.title} | ${course.units} | ${course.why} |`),
          "",
        ]
      : []),
    "## 1. Groups for DAP to decide",
    "",
    "Nothing in these groups changes until DAP says which course each code should be. Options: merge into one (say which title and units), or give one of them a different code.",
    "",
  ];
  if (plan.forDap.length === 0) out.push("None.", "");
  for (const group of plan.forDap) {
    out.push(`### ${group.code}`, "", group.why, "", header, ...group.courses.map(line), "");
  }
  out.push("## 2. Duplicates merged automatically", "", "Same code once tidied, same title and same units. Programme links, draft rows and prerequisites move to the course kept; the other goes to the Archive and can be restored.", "");
  if (plan.merges.length === 0) out.push("None.", "");
  for (const merge of plan.merges) {
    out.push(
      `### ${merge.code}`,
      "",
      `Kept: ${merge.keep.code} (${merge.keep.programmeLinks} programmes, ${merge.keep.draftRows} draft rows).${merge.otherDifferences.length ? ` Also differ: ${merge.otherDifferences.join(", ")}; the kept course's values stay.` : ""}`,
      "",
      header,
      line(merge.keep),
      ...merge.merge.map(line),
      "",
    );
  }
  out.push("## 3. Codes tidied", "", "| Code now | Becomes | Title | Programmes | Draft rows |", "|---|---|---|---|---|");
  for (const rename of plan.renames) {
    out.push(`| ${rename.code} | ${rename.to} | ${rename.title} | ${rename.programmeLinks} | ${rename.draftRows} |`);
  }
  if (plan.renames.length === 0) out.push("| (none) | | | | |");
  out.push("");
  if (plan.headings.length) {
    out.push(
      "## Headings imported as courses",
      "",
      "These look like spreadsheet headings, not courses: the real code is in the title. DAP decides whether to delete them; nothing changes here.",
      "",
      header,
      ...plan.headings.map(line),
      "",
    );
  }
  if (plan.untidyable.length) {
    out.push("## 4. Codes that can't be put in the format", "", header, ...plan.untidyable.map(line), "");
  }
  if (plan.draftClashes.length) {
    out.push(
      "## 5. Drafts with the same code twice",
      "",
      "These rows keep their codes; the Head of Department removes the extra row.",
      "",
      "| Programme | Code | Rows |",
      "|---|---|---|",
      ...plan.draftClashes.map((clash) => `| ${clash.programme} | ${clash.code} | ${clash.rows.join(", ")} |`),
      "",
    );
  }
  return out.join("\n");
}
