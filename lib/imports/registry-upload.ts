/**
 * Registry bulk upload (Course Registry, Bulk upload; work order tasks B2,
 * B13, B16 and B17), shared by the upload screen and
 * `scripts/upload-registry.ts`.
 *
 * Planning reads the database only: it validates every row, resolves owner
 * and programme codes (old codes are accepted with a warning, A5), matches
 * source programme names, and works out for each course whether it is new or
 * an update, and what would change. Applying writes the plan in one
 * transaction, in a few batched statements, so a run from far away (the
 * script, from Lagos) is as safe as one on the server.
 */
import type { CourseOwnership, CourseType, Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { courseDuplicateKeys, validateMasterCourseImportRows, type MasterCourseImportData } from "@/lib/imports/courses";
import type { SpreadsheetRecord } from "@/lib/imports/spreadsheet";
import { recordActivity } from "@/lib/activity-log";
import { matchProgrammeNames } from "@/lib/courses/programme-matching";
import { loadCodeLookups, type CodeLookup } from "@/lib/units/code-aliases";
import { courseCodeKey } from "@/lib/courses/code-key";
import { COURSE_CODE_PATTERN } from "@/lib/validation/name-format";
import { NOT_IN_ARCHIVED_CYCLE } from "@/lib/cycles/archive";
import { preloadRegistryCoursesForSubmission } from "@/lib/courses/gst-pool";

type Database = PrismaClient;

export type RowIssue = { row: number; errors: string[] };
export type RowNote = { row: number; code: string; note: string };

/** The Registry fields an upload writes. */
type CourseFields = {
  title: string;
  units: number;
  type: CourseType;
  ownership: CourseOwnership;
  level: number;
  semester: number | null;
  description: string | null;
  learningOutcomes: string[];
  courseContent: string | null;
  labWork: string | null;
  entrepreneurialAspect: string | null;
  curriculumSource: string | null;
  sourceReference: string | null;
  sourceProgrammes: string[];
  discoverable: boolean;
  ownerDeptId: string | null;
  ownerSchoolId: string | null;
};

/** Text fields an empty cell leaves alone when `keepExistingWhenEmpty` is set. */
const KEEPABLE_FIELDS = [
  "description",
  "learningOutcomes",
  "courseContent",
  "labWork",
  "entrepreneurialAspect",
  "curriculumSource",
  "sourceReference",
  "sourceProgrammes",
] as const;

export type PlannedCourse = {
  row: number;
  code: string;
  action: "create" | "update";
  existingId?: string;
  fields: Partial<CourseFields>;
  /** For updates: each field that changes, in words ("units: 2 -> 3"); none means the course is unchanged. */
  changes: string[];
  /** For updates with keepExistingWhenEmpty: fields kept because the cell was empty. */
  kept: string[];
  programmeIds: string[];
  isCore: boolean;
  data: MasterCourseImportData;
};

export type RegistryUploadPlan = {
  rows: number;
  /** Rows with errors: nothing is written while there are any. */
  invalid: RowIssue[];
  /** Rows whose owner, school or programme code does not exist. */
  ownerIssues: RowIssue[];
  /** Repeats of an earlier row in the same file, skipped (B17). */
  skipped: RowNote[];
  warnings: RowNote[];
  /** Rows that used an old school, department or programme code (A5). */
  codeWarnings: { row: number; warnings: string[] }[];
  courses: PlannedCourse[];
  unmatchedSourceProgrammes: string[];
  ambiguousSourceProgrammes: string[];
  /** Whether a General Education course is in the upload (every programme's draft is preloaded then). */
  affectsEveryProgramme: boolean;
};

export type RegistryUploadResult = {
  created: number;
  updated: number;
  /** Existing courses the file already matches: not written again. */
  unchanged: number;
  linked: number;
  affectedProgrammeIds: string[];
};

const textOrNull = (value: string) => (value ? value : null);

function fieldsFrom(data: MasterCourseImportData, ownerDeptId: string | null, ownerSchoolId: string | null): CourseFields {
  return {
    title: data.title,
    units: data.units,
    type: data.type as CourseType,
    ownership: data.ownership as CourseOwnership,
    level: data.level,
    semester: data.semester,
    description: textOrNull(data.description),
    learningOutcomes: data.learningOutcomes,
    courseContent: textOrNull(data.courseContent),
    labWork: textOrNull(data.labWork),
    entrepreneurialAspect: textOrNull(data.entrepreneurialAspect),
    curriculumSource: textOrNull(data.curriculumSource),
    sourceReference: textOrNull(data.sourceReference),
    sourceProgrammes: data.sourceProgrammes,
    discoverable: data.discoverable,
    ownerDeptId,
    ownerSchoolId,
  };
}

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

const shown = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "empty";
  if (Array.isArray(value)) return value.length === 0 ? "empty" : `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "string" && value.length > 40) return `"${value.slice(0, 37)}..."`;
  return typeof value === "string" ? `"${value}"` : String(value);
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Whether two titles name the same course ("General Physics I (Mechanics)"
 * and "General Physics I" do; "Paediatric Oncology" and "Neonatology" don't).
 * Only then is an existing description worth keeping under the new title.
 */
export function sameCourseTitle(a: string, b: string): boolean {
  const x = titleKey(a);
  const y = titleKey(b);
  return x === y || (x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x)));
}

/**
 * Plans an upload without writing anything. With `keepExistingWhenEmpty`, an
 * empty description, outcomes or content cell keeps what an existing course
 * with the same title already has (the script uses this; the upload screen
 * writes the row as it is).
 */
export async function planRegistryUpload(
  rows: SpreadsheetRecord[],
  options: { keepExistingWhenEmpty?: boolean } = {},
  db: Database = prisma,
): Promise<RegistryUploadPlan> {
  const [existing, lookups, programmes] = await Promise.all([
    db.masterCourse.findMany({
      select: {
        id: true,
        code: true,
        title: true,
        units: true,
        type: true,
        ownership: true,
        level: true,
        semester: true,
        description: true,
        learningOutcomes: true,
        courseContent: true,
        labWork: true,
        entrepreneurialAspect: true,
        curriculumSource: true,
        sourceReference: true,
        sourceProgrammes: true,
        discoverable: true,
        ownerDeptId: true,
        ownerSchoolId: true,
      },
    }),
    loadCodeLookups(db),
    db.programme.findMany({ select: { id: true, code: true, name: true, degreeType: true } }),
  ]);

  const validatedAll = validateMasterCourseImportRows(rows, {
    existingCodes: existing.map((course) => courseDuplicateKeys(course).code),
    allowExisting: true,
  });
  const skipped: RowNote[] = validatedAll
    .filter((row) => row.skipped)
    .map((row) => ({ row: row.rowNumber, code: row.data?.code ?? "", note: (row.warnings ?? []).join(" ") }));
  const validated = validatedAll.filter((row) => !row.skipped);
  const warnings: RowNote[] = validated.flatMap((row) =>
    (row.warnings ?? []).map((note) => ({ row: row.rowNumber, code: row.data?.code ?? "", note })),
  );
  const invalid = validated
    .filter((row) => row.errors.length > 0 || !row.data)
    .map((row) => ({ row: row.rowNumber, errors: row.errors }));

  const codeWarnings: { row: number; warnings: string[] }[] = [];
  const resolveCode = (lookup: CodeLookup, code: string, rowNumber: number) => {
    const found = lookup.resolve(code);
    if (found?.warning) {
      const entry = codeWarnings.find((item) => item.row === rowNumber);
      if (entry) entry.warnings.push(found.warning);
      else codeWarnings.push({ row: rowNumber, warnings: [found.warning] });
    }
    return found?.id;
  };

  // B3: "BIO102" and "BIO 102" are the same code, so an upload updates the
  // course however its code was spaced (the one in the format first).
  const byCode = new Map<string, (typeof existing)[number]>();
  for (const course of existing) {
    const key = courseCodeKey(course.code);
    const held = byCode.get(key);
    if (!held || (!COURSE_CODE_PATTERN.test(held.code) && COURSE_CODE_PATTERN.test(course.code))) byCode.set(key, course);
  }
  const ownerIssues: RowIssue[] = [];
  const courses: PlannedCourse[] = [];
  const unmatched = new Set<string>();
  const ambiguous = new Set<string>();

  if (invalid.length === 0) {
    for (const row of validated) {
      const data = row.data!;
      const departmentId = data.ownerDepartmentCode
        ? resolveCode(lookups.department, data.ownerDepartmentCode, row.rowNumber)
        : undefined;
      if (data.ownerDepartmentCode && !departmentId) {
        ownerIssues.push({ row: row.rowNumber, errors: [`Unknown department code ${data.ownerDepartmentCode}.`] });
        continue;
      }
      const schoolId =
        data.ownership === "SCHOOL" ? resolveCode(lookups.school, data.ownerSchoolCode, row.rowNumber) : undefined;
      if (data.ownership === "SCHOOL" && !schoolId) {
        ownerIssues.push({ row: row.rowNumber, errors: [`Unknown school code ${data.ownerSchoolCode}.`] });
        continue;
      }
      const programmeIds = data.programmeCodes.map((code) => resolveCode(lookups.programme, code, row.rowNumber));
      const unknownProgrammes = data.programmeCodes.filter((_code, index) => !programmeIds[index]);
      if (unknownProgrammes.length > 0) {
        ownerIssues.push({ row: row.rowNumber, errors: [`Unknown programme code(s): ${unknownProgrammes.join(", ")}.`] });
        continue;
      }
      const sourceMatches = matchProgrammeNames(data.sourceProgrammes, programmes);
      sourceMatches.unmatchedNames.forEach((name) => unmatched.add(name));
      sourceMatches.ambiguousNames.forEach((name) => ambiguous.add(name));

      const fields: Partial<CourseFields> = fieldsFrom(
        data,
        departmentId ?? null,
        data.ownership === "SCHOOL" ? (schoolId ?? null) : null,
      );
      const current = byCode.get(courseCodeKey(data.code));
      const changes: string[] = [];
      const kept: string[] = [];
      if (current) {
        // Text is kept only for the same course: under a new title it would describe another one.
        if (options.keepExistingWhenEmpty && sameCourseTitle(current.title, data.title)) {
          for (const field of KEEPABLE_FIELDS) {
            if (isEmpty(fields[field]) && !isEmpty(current[field])) {
              delete fields[field];
              kept.push(field);
            }
          }
        }
        for (const [field, value] of Object.entries(fields) as [keyof CourseFields, unknown][]) {
          if (!same(current[field], value)) changes.push(`${field}: ${shown(current[field])} -> ${shown(value)}`);
        }
      }
      courses.push({
        row: row.rowNumber,
        code: data.code,
        action: current ? "update" : "create",
        existingId: current?.id,
        fields,
        changes,
        kept,
        programmeIds: [...new Set([...programmeIds.filter((id): id is string => Boolean(id)), ...sourceMatches.matchedIds])],
        isCore: data.type !== "ELECTIVE",
        data,
      });
    }
  }

  return {
    rows: rows.length,
    invalid,
    ownerIssues,
    skipped,
    warnings,
    codeWarnings,
    courses,
    unmatchedSourceProgrammes: [...unmatched].sort(),
    ambiguousSourceProgrammes: [...ambiguous].sort(),
    affectsEveryProgramme: courses.some(
      (course) => course.data.ownership === "INSTITUTIONAL" && ["GST_NUC", "GST_BU"].includes(course.data.type),
    ),
  };
}

/** A plan with no invalid rows and no unknown codes can be applied. */
export const planIsReady = (plan: RegistryUploadPlan) => plan.invalid.length === 0 && plan.ownerIssues.length === 0;

const toJson = (fields: Partial<CourseFields>) => ({
  ...fields,
  ...(fields.learningOutcomes !== undefined && { learningOutcomes: fields.learningOutcomes as Prisma.InputJsonValue }),
  ...(fields.sourceProgrammes !== undefined && { sourceProgrammes: fields.sourceProgrammes as Prisma.InputJsonValue }),
});

/** Writes a ready plan in one transaction and logs it. */
export async function applyRegistryUpload(
  plan: RegistryUploadPlan,
  input: { actorId?: string | null; label?: string },
  db: Database = prisma,
): Promise<RegistryUploadResult> {
  if (!planIsReady(plan)) throw new Error("The upload has rows to fix first.");
  const creates = plan.courses.filter((course) => course.action === "create");
  const updates = plan.courses.filter((course) => course.action === "update" && course.changes.length > 0);
  const unchanged = plan.courses.filter((course) => course.action === "update" && course.changes.length === 0).length;

  return db.$transaction(
    async (tx) => {
      if (creates.length > 0) {
        await tx.masterCourse.createMany({
          data: creates.map((course) => ({ code: course.code, ...(toJson(course.fields) as CourseFields) })) as Prisma.MasterCourseCreateManyInput[],
        });
      }
      for (const course of updates) {
        await tx.masterCourse.update({ where: { id: course.existingId! }, data: toJson(course.fields) as Prisma.MasterCourseUpdateInput });
      }
      const ids = new Map(
        (
          await tx.masterCourse.findMany({
            where: { code: { in: plan.courses.map((course) => course.code) } },
            select: { id: true, code: true },
          })
        ).map((course) => [course.code, course.id]),
      );
      const links = plan.courses.flatMap((course) =>
        course.programmeIds.map((programmeId) => ({ courseId: ids.get(course.code)!, programmeId, isCore: course.isCore })),
      );
      const linked = links.length > 0 ? (await tx.programmeCourse.createMany({ data: links, skipDuplicates: true })).count : 0;

      await recordActivity(
        {
          actorId: input.actorId ?? undefined,
          action: "REGISTRY_COURSES_IMPORTED",
          entityType: "MASTER_COURSE",
          description: `Imported ${creates.length} new and updated ${updates.length} existing Registry courses${unchanged ? ` (${unchanged} already up to date)` : ""}${input.label ? ` (${input.label})` : ""}.`,
          metadata: {
            created: creates.length,
            updated: updates.length,
            unchanged,
            programmeLinksCreated: linked,
            sources: [...new Set(plan.courses.map((course) => course.data.curriculumSource).filter(Boolean))],
            ...(input.label && { file: input.label }),
          },
        },
        tx,
      );

      return {
        created: creates.length,
        updated: updates.length,
        unchanged,
        linked,
        affectedProgrammeIds: [...new Set(plan.courses.flatMap((course) => course.programmeIds))],
      };
    },
    { timeout: 10 * 60_000, maxWait: 30_000 },
  );
}

/** The editable drafts an upload adds Registry courses to (none before A3 opens the real cycle). */
export async function draftsToPreload(plan: RegistryUploadPlan, affectedProgrammeIds: string[], db: Database = prisma) {
  return db.submission.findMany({
    where: {
      status: { in: ["DRAFT", "CORRECTIONS_REQUIRED"] },
      AND: [NOT_IN_ARCHIVED_CYCLE],
      ...(!plan.affectsEveryProgramme && { programmeId: { in: affectedProgrammeIds } }),
    },
    select: { id: true },
  });
}

/** Adds the uploaded Registry courses to the editable drafts, as the upload screen always has. */
export async function preloadAfterUpload(plan: RegistryUploadPlan, result: RegistryUploadResult, db: Database = prisma) {
  const drafts = await draftsToPreload(plan, result.affectedProgrammeIds, db);
  for (const draft of drafts) await preloadRegistryCoursesForSubmission(draft.id);
  return drafts.length;
}
