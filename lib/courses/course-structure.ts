/**
 * A draft's Course Structure, pre-filled (work order task E1, rule W1).
 *
 * Each draft gets, for every level its programme runs:
 * 1. the General Education block of section 6.1, locked (W1); and
 * 2. its programme's courses from package file 02: level, semester, code,
 *    title, units, core or elective, with prerequisites from the Registry.
 *
 * Planning is pure, so it can be checked in tests and shown as a dry run;
 * applying only adds rows. A row already in the draft (by code) is never
 * changed, so running it again, or after a Head has started, is safe.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prepareCourseGraceState } from "@/lib/courses/grace-compliance";
import { titleKey, uniqueTitle } from "@/lib/courses/unique-title";
import {
  generalEducationBlockFor,
  isGeneralEducationCode,
  isGeneralEducationFamily,
} from "@/lib/courses/general-education";
import { formatCourseCode, formatCourseTitle, isValidCourseCode } from "@/lib/validation/name-format";

type Database = PrismaClient | Prisma.TransactionClient;

/** One row of package file 02 ("All programmes" sheet). */
export type StructureRow = {
  rowNumber: number;
  programmeCode: string;
  programmeName: string;
  level: number | null;
  semester: number | null;
  code: string;
  title: string;
  units: number | null;
  status: string;
  option: string | null;
};

/** What the Registry holds for a course code. */
export type RegistryCourse = {
  id: string;
  code: string;
  title: string;
  units: number;
  semester: number | null;
  prerequisites: string[];
};

export type PlannedCourse = {
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number | null;
  status: "CORE" | "ELECTIVE";
  prerequisites: string | null;
  masterCourseId: string | null;
  generalEducation: boolean;
};

export type StructureNoteKind =
  | "NO_UNITS"
  | "BAD_ROW"
  | "LISTED_TWICE"
  | "NEEDS_EXEMPTION"
  | "NOT_IN_REGISTRY";

export type StructureNote = {
  kind: StructureNoteKind;
  code: string;
  rowNumber?: number;
  message: string;
};

export type StructurePlan = {
  courses: PlannedCourse[];
  notes: StructureNote[];
  counts: {
    fileRows: number;
    fromFile: number;
    block: number;
    coveredByBlock: number;
    alreadyInDraft: number;
    skipped: number;
  };
};

/**
 * Works out the rows to add to one draft. `existing` is what the draft holds
 * already; nothing in it is changed.
 */
export function planCourseStructure(input: {
  levels: number[];
  rows: StructureRow[];
  registry: Map<string, RegistryCourse>;
  existing: { code: string; title: string }[];
}): StructurePlan {
  const existingCodes = new Set(input.existing.map((course) => course.code));
  const takenTitles = new Set(input.existing.map((course) => titleKey(course.title)));
  const taken = new Set(existingCodes);
  const courses: PlannedCourse[] = [];
  const notes: StructureNote[] = [];
  const counts = { fileRows: input.rows.length, fromFile: 0, block: 0, coveredByBlock: 0, alreadyInDraft: 0, skipped: 0 };
  const prerequisitesOf = (master: RegistryCourse | undefined) => master?.prerequisites.join(", ") || null;

  // 1. The General Education block (W1) comes first, with section 6.1's
  // titles and units, linked to its Registry record where there is one.
  for (const entry of generalEducationBlockFor(input.levels)) {
    if (taken.has(entry.code)) continue;
    const master = input.registry.get(entry.code);
    const title = uniqueTitle(entry.title, entry.code, takenTitles);
    takenTitles.add(titleKey(title));
    taken.add(entry.code);
    courses.push({
      code: entry.code,
      title,
      units: entry.units,
      level: entry.level,
      semester: entry.semester,
      status: "CORE",
      prerequisites: prerequisitesOf(master),
      masterCourseId: master?.id ?? null,
      generalEducation: true,
    });
    counts.block += 1;
  }

  // 2. The programme's own courses from file 02.
  const seen = new Map<string, StructureRow>();
  for (const row of input.rows) {
    const code = formatCourseCode(row.code);
    if (!isValidCourseCode(code)) {
      notes.push({ kind: "BAD_ROW", code: row.code, rowNumber: row.rowNumber, message: `"${row.code}" is not a course code.` });
      counts.skipped += 1;
      continue;
    }
    if (isGeneralEducationCode(code)) {
      counts.coveredByBlock += 1;
      continue;
    }
    if (isGeneralEducationFamily(code)) {
      notes.push({
        kind: "NEEDS_EXEMPTION",
        code,
        rowNumber: row.rowNumber,
        message: `${code} ${row.title} is a General Education course outside the standard block (section 6.1). Left out until DAP records an exemption with a reason.`,
      });
      counts.skipped += 1;
      continue;
    }
    const first = seen.get(code);
    if (first) {
      notes.push({
        kind: "LISTED_TWICE",
        code,
        rowNumber: row.rowNumber,
        message: `${code} is listed twice for this programme; kept the first (row ${first.rowNumber}, level ${first.level}${first.semester ? `, semester ${first.semester}` : ""}).`,
      });
      counts.skipped += 1;
      continue;
    }
    seen.set(code, row);
    if (existingCodes.has(code)) {
      counts.alreadyInDraft += 1;
      continue;
    }
    if (row.level === null || !Number.isInteger(row.level / 100) || row.level < 100) {
      notes.push({ kind: "BAD_ROW", code, rowNumber: row.rowNumber, message: `${code} has no valid level ("${row.level ?? ""}").` });
      counts.skipped += 1;
      continue;
    }
    if (row.semester !== null && row.semester !== 1 && row.semester !== 2) {
      notes.push({ kind: "BAD_ROW", code, rowNumber: row.rowNumber, message: `${code} has semester "${row.semester}"; it should be 1, 2 or empty (sessional).` });
      counts.skipped += 1;
      continue;
    }
    const master = input.registry.get(code);
    const units = row.units ?? master?.units ?? null;
    if (units === null || !Number.isInteger(units) || units < 0 || units > 12) {
      notes.push({
        kind: "NO_UNITS",
        code,
        rowNumber: row.rowNumber,
        message: `${code} ${row.title} has no units in file 02${master ? "" : " or the Registry"}; DAP to supply them.`,
      });
      counts.skipped += 1;
      continue;
    }
    if (!master) {
      notes.push({
        kind: "NOT_IN_REGISTRY",
        code,
        rowNumber: row.rowNumber,
        message: `${code} isn't in the Registry yet; added from file 02 and linked once the Registry has it.`,
      });
    }
    const title = uniqueTitle(master?.title ?? formatCourseTitle(row.title.trim()), code, takenTitles);
    takenTitles.add(titleKey(title));
    taken.add(code);
    courses.push({
      code,
      title,
      units,
      level: row.level,
      semester: row.semester,
      status: row.status.trim().toUpperCase() === "E" ? "ELECTIVE" : "CORE",
      prerequisites: prerequisitesOf(master),
      masterCourseId: master?.id ?? null,
      generalEducation: false,
    });
    counts.fromFile += 1;
  }

  return { courses, notes, counts };
}

/** The Registry records for these codes, with their prerequisites' codes. */
export async function loadRegistryCourses(db: Database, codes: string[]): Promise<Map<string, RegistryCourse>> {
  const masters = await db.masterCourse.findMany({
    where: { code: { in: [...new Set(codes)] } },
    select: {
      id: true,
      code: true,
      title: true,
      units: true,
      semester: true,
      prerequisites: { select: { code: true } },
    },
  });
  return new Map(
    masters.map((master) => [
      master.code,
      { ...master, prerequisites: master.prerequisites.map((item) => item.code) },
    ]),
  );
}

/**
 * Starts a draft course's details from the Registry's shared description,
 * when the Registry has one and the draft doesn't yet. Heads of Department
 * keep editorial control over their copy.
 */
export async function seedRegistryDescription(
  db: Database,
  input: {
    courseId: string;
    submissionId: string;
    title: string;
    master: {
      learningOutcomes: Prisma.JsonValue | null;
      courseContent: string | null;
      description: string | null;
      labWork: string | null;
      entrepreneurialAspect: string | null;
    };
    programmeLink?: {
      learningOutcomesOverride: Prisma.JsonValue | null;
      courseContentOverride: string | null;
    } | null;
  },
): Promise<boolean> {
  const { master, programmeLink } = input;
  const outcomes = programmeLink?.learningOutcomesOverride ?? master.learningOutcomes;
  const learningOutcomes = Array.isArray(outcomes)
    ? outcomes.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
  const courseContent =
    programmeLink?.courseContentOverride?.trim() || master.courseContent?.trim() || master.description?.trim() || "";
  const hasDetails =
    learningOutcomes.length > 0 || courseContent || master.labWork?.trim() || master.entrepreneurialAspect?.trim();
  if (!hasDetails) return false;
  const existing = await db.courseDescription.findUnique({ where: { courseId: input.courseId }, select: { id: true } });
  if (existing) return false;
  const graceState = await prepareCourseGraceState(db, { title: input.title, learningOutcomes, courseContent });
  await db.courseDescription.create({
    data: {
      courseId: input.courseId,
      submissionId: input.submissionId,
      courseContent: courseContent || null,
      learningOutcomes,
      labWork: master.labWork?.trim() || null,
      entrepreneurialAspect: master.entrepreneurialAspect?.trim() || null,
      ...graceState,
    },
  });
  return true;
}

/**
 * Adds the planned rows to the draft, links Registry courses to the
 * programme, and starts their details from the Registry. Returns how many
 * rows were added.
 */
export async function applyCourseStructure(
  db: Database,
  draft: { id: string; programmeId: string },
  plan: StructurePlan,
): Promise<{ added: number; descriptions: number }> {
  if (plan.courses.length === 0) return { added: 0, descriptions: 0 };
  const created = await db.course.createManyAndReturn({
    data: plan.courses.map((course) => ({
      submissionId: draft.id,
      code: course.code,
      title: course.title,
      units: course.units,
      level: course.level,
      semester: course.semester,
      status: course.status,
      prerequisites: course.prerequisites,
      masterCourseId: course.masterCourseId,
    })),
    skipDuplicates: true,
    select: { id: true, title: true, masterCourseId: true },
  });

  const masterIds = [...new Set(created.map((course) => course.masterCourseId).filter((id): id is string => Boolean(id)))];
  if (masterIds.length === 0) return { added: created.length, descriptions: 0 };
  await db.programmeCourse.createMany({
    data: masterIds.map((courseId) => ({ programmeId: draft.programmeId, courseId, isCore: true })),
    skipDuplicates: true,
  });
  const masters = await db.masterCourse.findMany({
    where: { id: { in: masterIds } },
    select: {
      id: true,
      learningOutcomes: true,
      courseContent: true,
      description: true,
      labWork: true,
      entrepreneurialAspect: true,
      programmeLinks: {
        where: { programmeId: draft.programmeId },
        select: { learningOutcomesOverride: true, courseContentOverride: true },
      },
    },
  });
  const masterById = new Map(masters.map((master) => [master.id, master]));
  let descriptions = 0;
  for (const course of created) {
    const master = course.masterCourseId ? masterById.get(course.masterCourseId) : undefined;
    if (!master) continue;
    const seeded = await seedRegistryDescription(db, {
      courseId: course.id,
      submissionId: draft.id,
      title: course.title,
      master,
      programmeLink: master.programmeLinks[0] ?? null,
    });
    if (seeded) descriptions += 1;
  }
  return { added: created.length, descriptions };
}
