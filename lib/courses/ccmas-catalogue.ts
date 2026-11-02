import type { CourseOwnership, CourseType, Prisma } from "@prisma/client";
import catalogueJson from "@/data/ccmas/catalogue.json";
import reviewJson from "@/data/ccmas/catalogue-review.json";
import prisma from "@/lib/prisma";
import { recordActivity } from "@/lib/activity-log";
import { matchProgrammeNames } from "@/lib/courses/programme-matching";

type CcmasVariant = {
  sourceProgramme: string;
  title: string;
  units: number;
  semester: number;
  learningOutcomes: string[];
  courseContent: string;
  sourceReference: string;
};

type CcmasCourse = {
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number;
  description: string;
  learningOutcomes: string[];
  courseContent: string;
  labWork: string;
  entrepreneurialAspect: string;
  curriculumSource: string;
  sourceReference: string;
  sourceProgrammes: string[];
  variants: CcmasVariant[];
  discoverable: boolean;
};

type CcmasCatalogue = {
  version: string;
  semesterBasis: string;
  courses: CcmasCourse[];
};

type CcmasReview = {
  extractedUniqueCourses: number;
  itemsRequiringReview: number;
};

const catalogue = catalogueJson as unknown as CcmasCatalogue;
const review = reviewJson as unknown as CcmasReview;
const MAX_AUTOMATIC_PROGRAMME_VARIANTS = 200;

export function getCcmasCatalogueSummary() {
  return {
    version: catalogue.version,
    semesterBasis: catalogue.semesterBasis,
    catalogueCourses: catalogue.courses.length,
    reviewItems: review.itemsRequiringReview,
  };
}

// Rows per database call. Large enough that the whole catalogue loads in a
// few dozen round trips, small enough to stay well inside query size limits.
const BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The Registry values a CCMAS course should have. */
function masterValues(source: CcmasCourse) {
  const type: CourseType = source.code.startsWith("GST ") ? "GST_NUC" : "CORE";
  const ownership: CourseOwnership = "INSTITUTIONAL";
  return {
    title: source.title,
    units: source.units,
    type,
    ownership,
    level: source.level,
    semester: source.semester,
    description: source.description || null,
    learningOutcomes: source.learningOutcomes as Prisma.InputJsonValue,
    courseContent: source.courseContent || null,
    labWork: source.labWork || null,
    entrepreneurialAspect: source.entrepreneurialAspect || null,
    curriculumSource: source.curriculumSource,
    sourceReference: source.sourceReference,
    sourceProgrammes: source.sourceProgrammes as Prisma.InputJsonValue,
    discoverable: source.discoverable,
  };
}

type MasterValues = ReturnType<typeof masterValues>;
const MASTER_FIELDS = [
  "title",
  "units",
  "type",
  "ownership",
  "level",
  "semester",
  "description",
  "learningOutcomes",
  "courseContent",
  "labWork",
  "entrepreneurialAspect",
  "curriculumSource",
  "sourceReference",
  "sourceProgrammes",
  "discoverable",
] as const satisfies readonly (keyof MasterValues)[];

/** The programme-specific values for a CCMAS course in one programme. */
function linkValues(source: CcmasCourse, variant: CcmasVariant) {
  return {
    isCore: true,
    titleOverride: variant.title !== source.title ? variant.title : null,
    unitsOverride: variant.units !== source.units ? variant.units : null,
    semesterOverride:
      variant.semester !== source.semester ? variant.semester : null,
    learningOutcomesOverride: variant.learningOutcomes as Prisma.InputJsonValue,
    courseContentOverride: variant.courseContent || null,
    sourceProgrammeName: variant.sourceProgramme,
    sourceReference: variant.sourceReference,
  };
}

type LinkValues = ReturnType<typeof linkValues>;
const LINK_FIELDS = [
  "isCore",
  "titleOverride",
  "unitsOverride",
  "semesterOverride",
  "learningOutcomesOverride",
  "courseContentOverride",
  "sourceProgrammeName",
  "sourceReference",
] as const satisfies readonly (keyof LinkValues)[];

function changedFields<K extends string>(
  current: Record<K, unknown>,
  next: Record<K, unknown>,
  fields: readonly K[],
): boolean {
  return fields.some((field) => !sameJson(current[field], next[field]));
}

/**
 * Loads or refreshes the official CCMAS catalogue into the Registry.
 *
 * - Courses Babcock already created itself (same code, not from CCMAS) are
 *   never changed; they are reported as `skippedUniversityCodes`.
 * - Writes are batched and unchanged rows are skipped, so the first load is
 *   a few dozen database calls and a refresh is close to none.
 * - Programme submissions already in progress are not touched. New drafts
 *   pick up their programme's courses when they are created.
 */
export async function syncCcmasCatalogue(actorId?: string | null) {
  const codes = catalogue.courses.map((course) => course.code);
  const [programmes, existingCourses] = await Promise.all([
    prisma.programme.findMany({
      select: { id: true, name: true, code: true, degreeType: true },
    }),
    prisma.masterCourse.findMany({
      where: { code: { in: codes } },
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
      },
    }),
  ]);
  const existingByCode = new Map(existingCourses.map((c) => [c.code, c]));

  // ── 1. Registry courses ──
  const toCreate: Prisma.MasterCourseCreateManyInput[] = [];
  const toUpdate: Array<{ id: string; data: MasterValues }> = [];
  const skippedUniversityCodes: string[] = [];
  let unchanged = 0;

  for (const source of catalogue.courses) {
    const values = masterValues(source);
    const existing = existingByCode.get(source.code);
    if (!existing) {
      toCreate.push({ code: source.code, ...values });
    } else if (existing.curriculumSource !== catalogue.version) {
      // A university-developed course already uses this code: leave it alone.
      skippedUniversityCodes.push(source.code);
    } else if (changedFields(existing, values, MASTER_FIELDS)) {
      toUpdate.push({ id: existing.id, data: values });
    } else {
      unchanged += 1;
    }
  }

  for (const batch of chunk(toCreate, BATCH_SIZE)) {
    await prisma.masterCourse.createMany({ data: batch, skipDuplicates: true });
  }
  for (const batch of chunk(toUpdate, 100)) {
    await prisma.$transaction(
      batch.map(({ id, data }) => prisma.masterCourse.update({ where: { id }, data })),
    );
  }

  // ── 2. Programme links for matched programmes ──
  const skipped = new Set(skippedUniversityCodes);
  const ccmasCourses = await prisma.masterCourse.findMany({
    where: {
      code: { in: codes.filter((code) => !skipped.has(code)) },
      curriculumSource: catalogue.version,
    },
    select: { id: true, code: true },
  });
  const courseIdByCode = new Map(ccmasCourses.map((c) => [c.code, c.id]));

  const sourceProgrammeCounts = new Map<string, number>();
  for (const source of catalogue.courses) {
    for (const variant of source.variants) {
      sourceProgrammeCounts.set(
        variant.sourceProgramme,
        (sourceProgrammeCounts.get(variant.sourceProgramme) ?? 0) + 1,
      );
    }
  }

  // Programme-name matching is the same for every course, so do it once per name.
  const matchCache = new Map<string, ReturnType<typeof matchProgrammeNames>>();
  const unmatchedProgrammeNames = new Set<string>();
  const ambiguousProgrammeNames = new Set<string>();
  const reviewProgrammeNames = new Set<string>();

  const wantedLinks = new Map<
    string,
    { programmeId: string; courseId: string; data: LinkValues }
  >();
  for (const source of catalogue.courses) {
    const courseId = courseIdByCode.get(source.code);
    if (!courseId) continue;
    for (const variant of source.variants) {
      const name = variant.sourceProgramme;
      if ((sourceProgrammeCounts.get(name) ?? 0) > MAX_AUTOMATIC_PROGRAMME_VARIANTS) {
        reviewProgrammeNames.add(name);
        continue;
      }
      let match = matchCache.get(name);
      if (!match) {
        match = matchProgrammeNames([name], programmes);
        matchCache.set(name, match);
      }
      match.unmatchedNames.forEach((n) => unmatchedProgrammeNames.add(n));
      match.ambiguousNames.forEach((n) => ambiguousProgrammeNames.add(n));
      for (const programmeId of match.matchedIds) {
        const key = `${programmeId}:${courseId}`;
        if (!wantedLinks.has(key)) {
          wantedLinks.set(key, { programmeId, courseId, data: linkValues(source, variant) });
        }
      }
    }
  }

  const existingLinks = await prisma.programmeCourse.findMany({
    where: { courseId: { in: [...courseIdByCode.values()] } },
    select: {
      id: true,
      programmeId: true,
      courseId: true,
      isCore: true,
      titleOverride: true,
      unitsOverride: true,
      semesterOverride: true,
      learningOutcomesOverride: true,
      courseContentOverride: true,
      sourceProgrammeName: true,
      sourceReference: true,
    },
  });
  const existingLinkByKey = new Map(
    existingLinks.map((link) => [`${link.programmeId}:${link.courseId}`, link]),
  );

  const linksToCreate: Prisma.ProgrammeCourseCreateManyInput[] = [];
  const linksToUpdate: Array<{ id: string; data: LinkValues }> = [];
  for (const [key, wanted] of wantedLinks) {
    const existing = existingLinkByKey.get(key);
    if (!existing) {
      linksToCreate.push({
        programmeId: wanted.programmeId,
        courseId: wanted.courseId,
        ...wanted.data,
      });
    } else if (changedFields(existing, wanted.data, LINK_FIELDS)) {
      linksToUpdate.push({ id: existing.id, data: wanted.data });
    }
  }

  for (const batch of chunk(linksToCreate, BATCH_SIZE)) {
    await prisma.programmeCourse.createMany({ data: batch, skipDuplicates: true });
  }
  for (const batch of chunk(linksToUpdate, 100)) {
    await prisma.$transaction(
      batch.map(({ id, data }) => prisma.programmeCourse.update({ where: { id }, data })),
    );
  }

  const result = {
    version: catalogue.version,
    catalogueCourses: catalogue.courses.length,
    created: toCreate.length,
    updated: toUpdate.length,
    unchanged,
    skippedUniversityCodes: skippedUniversityCodes.sort(),
    linked: wantedLinks.size,
    linksCreated: linksToCreate.length,
    linksUpdated: linksToUpdate.length,
    unmatchedProgrammeNames: [...unmatchedProgrammeNames].sort(),
    ambiguousProgrammeNames: [...ambiguousProgrammeNames].sort(),
    reviewProgrammeNames: [...reviewProgrammeNames].sort(),
  };

  await recordActivity({
    actorId,
    action: "CCMAS_CATALOGUE_SYNCHRONISED",
    entityType: "MASTER_COURSE",
    description: `Synchronised the ${catalogue.version} catalogue: ${result.created} added, ${result.updated} updated, ${skippedUniversityCodes.length} university course code(s) left unchanged, ${result.linked} programme links.`,
    metadata: {
      ...result,
      // Keep the log entry small; the full list is in the sync result.
      skippedUniversityCodes: skippedUniversityCodes.slice(0, 100),
    },
  });

  return result;
}
