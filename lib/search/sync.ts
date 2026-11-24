/**
 * Task K1: keeps the search table (search_documents) up to date. Records
 * changed since the last refresh are written again, deleted ones are
 * removed, and the Academic Policy is re-read when a new version is uploaded.
 *
 * A refresh runs before a search when the last one is older than the
 * settings file's refreshSeconds (30), so a saved record is findable within
 * half a minute; the daily job runs a full refresh. One refresh at a time.
 */
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { SEARCH_SETTINGS } from "@/lib/search/config";
import { compactCode } from "@/lib/search/normalise";
import { formatStaffName, getAcademicRankDisplay } from "@/lib/validation/name-format";
import { readPolicy } from "@/lib/policy/library";
import { inlineText, parseInline } from "@/lib/policy/markdown";

type Doc = {
  type: string;
  id: string;
  title: string;
  code: string | null;
  secondary: string | null;
  url: string;
  filters: Record<string, unknown>;
  visibility: string;
  updatedAt: Date | null;
  /** Old codes and other words that should find it as strongly as its title. */
  aliases: string;
  body: string;
};

const BODY_LIMIT = 4000;
const BATCH = 500;
const text = (value: unknown): string =>
  Array.isArray(value) ? value.map(text).join(" ") : typeof value === "string" ? value : "";

/** True when the search table doesn't exist yet (its migration hasn't run). */
export function isMissingSearchTable(error: unknown): boolean {
  const meta = (error as { meta?: { code?: string; message?: string } })?.meta;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return meta?.code === "42P01" || /search_documents" does not exist|relation "search_documents"/.test(message + (meta?.message ?? ""));
}

async function upsert(docs: Doc[]) {
  for (let start = 0; start < docs.length; start += BATCH) {
    const batch = docs.slice(start, start + BATCH);
    const column = <T,>(pick: (doc: Doc) => T) => batch.map(pick);
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO search_documents (entity_type, entity_id, title, code, code_key, secondary, url, filters, visibility, source_updated_at, search_text, tsv)
      SELECT t.entity_type, t.entity_id, t.title, t.code, t.code_key, t.secondary, t.url, t.filters::jsonb, t.visibility, t.updated_at::timestamp(3),
        lower(unaccent(t.title || ' ' || coalesce(t.code, '') || ' ' || t.aliases)),
        setweight(to_tsvector('simple', unaccent(coalesce(t.code, '') || ' ' || lower(coalesce(t.code_key, '')) || ' ' || t.title || ' ' || t.aliases)), 'A')
          || setweight(to_tsvector('simple', unaccent(coalesce(t.secondary, ''))), 'B')
          || setweight(to_tsvector('simple', unaccent(t.body)), 'C')
      FROM unnest(
        ${column((doc) => doc.type)}::text[], ${column((doc) => doc.id)}::text[], ${column((doc) => doc.title)}::text[],
        ${column((doc) => doc.code)}::text[], ${column((doc) => (doc.code ? compactCode(doc.code) : null))}::text[],
        ${column((doc) => doc.secondary)}::text[], ${column((doc) => doc.url)}::text[], ${column((doc) => JSON.stringify(doc.filters))}::text[],
        ${column((doc) => doc.visibility)}::text[], ${column((doc) => doc.updatedAt?.toISOString() ?? null)}::text[],
        ${column((doc) => doc.aliases)}::text[], ${column((doc) => doc.body.slice(0, BODY_LIMIT))}::text[]
      ) AS t(entity_type, entity_id, title, code, code_key, secondary, url, filters, visibility, updated_at, aliases, body)
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        title = EXCLUDED.title, code = EXCLUDED.code, code_key = EXCLUDED.code_key, secondary = EXCLUDED.secondary,
        url = EXCLUDED.url, filters = EXCLUDED.filters, visibility = EXCLUDED.visibility,
        source_updated_at = EXCLUDED.source_updated_at, search_text = EXCLUDED.search_text, tsv = EXCLUDED.tsv`);
  }
}

async function watermark(type: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<{ max: Date | null }[]>(
    Prisma.sql`SELECT max(source_updated_at) AS max FROM search_documents WHERE entity_type = ${type}`,
  );
  return rows[0]?.max ?? null;
}

const changedSince = (since: Date | null) => (since ? { updatedAt: { gte: since } } : {});
const visibleTo = (type: string) =>
  (SEARCH_SETTINGS.entities as Record<string, { visibleTo: string }>)[type]?.visibleTo ?? "ALL_SIGNED_IN";

/** Old codes for each new code (A5's aliases and the settings file's). */
async function oldCodesByNewCode(): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const add = (newCode: string, oldCode: string) => map.set(compactCode(newCode), [...(map.get(compactCode(newCode)) ?? []), oldCode]);
  for (const [oldCode, newCode] of Object.entries(SEARCH_SETTINGS.unitCodeAliases)) add(newCode, oldCode);
  for (const alias of await prisma.codeAlias.findMany({ select: { oldCode: true, newCode: true } })) add(alias.newCode, alias.oldCode);
  return map;
}

async function courseDocs(since: Date | null): Promise<Doc[]> {
  const courses = await prisma.masterCourse.findMany({
    where: changedSince(since),
    select: {
      id: true, code: true, title: true, units: true, level: true, semester: true, type: true, ownership: true,
      description: true, courseContent: true, learningOutcomes: true, curriculumSource: true, updatedAt: true,
      ownerDepartment: { select: { name: true, code: true } },
      ownerSchool: { select: { name: true } },
    },
  });
  return courses.map((course) => ({
    type: "course",
    id: course.id,
    title: course.title,
    code: course.code,
    secondary: [
      `${course.units} units`,
      `${course.level} level`,
      course.ownerDepartment?.name ?? course.ownerSchool?.name ?? (course.ownership === "INSTITUTIONAL" ? "University-wide" : null),
    ]
      .filter(Boolean)
      .join(" · "),
    url: `/master-courses?q=${encodeURIComponent(course.code)}`,
    filters: {
      level: course.level,
      semester: course.semester,
      type: course.type,
      ownership: course.ownership,
      ownerDepartment: course.ownerDepartment?.code ?? null,
      curriculumSource: course.curriculumSource,
      hasDescription: Boolean(course.courseContent || course.description),
    },
    visibility: visibleTo("course"),
    updatedAt: course.updatedAt,
    aliases: "",
    body: [course.description, course.courseContent, text(course.learningOutcomes)].filter(Boolean).join(" "),
  }));
}

async function unitDocs(since: Date | null): Promise<Doc[]> {
  const oldCodes = await oldCodesByNewCode();
  const aliasesFor = (code: string) => (oldCodes.get(compactCode(code)) ?? []).join(" ");
  const [schools, departments, programmes] = await Promise.all([
    prisma.school.findMany({ where: changedSince(since), select: { id: true, name: true, code: true, updatedAt: true } }),
    prisma.department.findMany({ where: changedSince(since), select: { id: true, name: true, code: true, updatedAt: true, school: { select: { name: true } } } }),
    prisma.programme.findMany({
      where: changedSince(since),
      select: { id: true, name: true, code: true, degreeType: true, updatedAt: true, department: { select: { name: true, school: { select: { name: true } } } } },
    }),
  ]);
  return [
    ...schools.map((school) => ({
      type: "school", id: school.id, title: school.name, code: school.code, secondary: "School",
      url: `/academic-units?q=${encodeURIComponent(school.code)}`, filters: {}, visibility: visibleTo("school"),
      updatedAt: school.updatedAt, aliases: aliasesFor(school.code), body: "",
    })),
    ...departments.map((department) => ({
      type: "department", id: department.id, title: department.name, code: department.code, secondary: department.school.name,
      url: `/academic-units?q=${encodeURIComponent(department.code)}`, filters: { school: department.school.name }, visibility: visibleTo("department"),
      updatedAt: department.updatedAt, aliases: aliasesFor(department.code), body: "",
    })),
    ...programmes.map((programme) => ({
      type: "programme", id: programme.id, title: programme.name, code: programme.code,
      secondary: [programme.degreeType, programme.department.name].filter(Boolean).join(" · "),
      url: `/academic-units?q=${encodeURIComponent(programme.code)}`,
      filters: { school: programme.department.school.name, department: programme.department.name, degreeType: programme.degreeType },
      visibility: visibleTo("programme"), updatedAt: programme.updatedAt, aliases: aliasesFor(programme.code), body: "",
    })),
  ];
}

async function personDocs(since: Date | null): Promise<Doc[]> {
  const staff = await prisma.staff.findMany({
    where: { isActive: true, ...changedSince(since) },
    select: {
      id: true, title: true, firstName: true, middleName: true, surname: true, academicRank: true, specialization: true,
      updatedAt: true, department: { select: { name: true, code: true } },
    },
  });
  return staff.map((person) => ({
    type: "person",
    id: person.id,
    title: formatStaffName(person),
    code: null,
    secondary: [getAcademicRankDisplay(person.academicRank), person.department.name].filter(Boolean).join(" · "),
    url: `/staff?q=${encodeURIComponent(person.surname)}`,
    filters: { department: person.department.code, rank: person.academicRank },
    visibility: visibleTo("person"),
    updatedAt: person.updatedAt,
    aliases: [person.firstName, person.middleName, person.surname].filter(Boolean).join(" "),
    body: [person.specialization, person.department.name].filter(Boolean).join(" "),
  }));
}

/** The policy's sections, when the current version differs from the indexed one. */
async function refreshPolicy() {
  const policy = await readPolicy();
  if (!policy) return;
  const stored = await prisma.$queryRaw<{ version: string | null }[]>(
    Prisma.sql`SELECT filters->>'versionId' AS version FROM search_documents WHERE entity_type = 'policySection' LIMIT 1`,
  );
  if (stored[0]?.version === policy.version.id) return;
  await prisma.$executeRaw(Prisma.sql`DELETE FROM search_documents WHERE entity_type = 'policySection'`);
  await upsert(
    policy.sections.map((section) => ({
      type: "policySection",
      id: section.id,
      title: section.title,
      code: null,
      secondary: `Academic Policy · ${policy.version.label}`,
      url: `/policy#${section.id}`,
      filters: { versionId: policy.version.id },
      visibility: visibleTo("policySection"),
      updatedAt: policy.version.createdAt ? new Date(policy.version.createdAt) : null,
      aliases: "",
      body: inlineText(parseInline(section.body.replace(/\s+/g, " "))),
    })),
  );
}

/** Removes records that were deleted, or staff made inactive. */
async function pruneDeleted() {
  await prisma.$executeRaw(Prisma.sql`DELETE FROM search_documents d WHERE d.entity_type = 'course' AND NOT EXISTS (SELECT 1 FROM master_courses m WHERE m.id = d.entity_id)`);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM search_documents d WHERE d.entity_type = 'programme' AND NOT EXISTS (SELECT 1 FROM programmes p WHERE p.id = d.entity_id)`);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM search_documents d WHERE d.entity_type = 'department' AND NOT EXISTS (SELECT 1 FROM departments p WHERE p.id = d.entity_id)`);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM search_documents d WHERE d.entity_type = 'school' AND NOT EXISTS (SELECT 1 FROM schools p WHERE p.id = d.entity_id)`);
  await prisma.$executeRaw(Prisma.sql`DELETE FROM search_documents d WHERE d.entity_type = 'person' AND NOT EXISTS (SELECT 1 FROM staff s WHERE s.id = d.entity_id AND s."isActive")`);
}

let running: Promise<{ written: number }> | null = null;
let lastRefreshAt = 0;

/** Writes what changed (everything with full), removes what was deleted. */
export function refreshSearchIndex(options: { full?: boolean } = {}): Promise<{ written: number }> {
  if (running) return running;
  running = (async () => {
    const full = Boolean(options.full);
    const [courseMark, unitMarks, personMark] = full
      ? [null, null, null]
      : await Promise.all([
          watermark("course"),
          Promise.all(["school", "department", "programme"].map(watermark)).then((marks) =>
            marks.some((mark) => mark === null) ? null : marks.reduce((a, b) => (a! < b! ? a : b)),
          ),
          watermark("person"),
        ]);
    const docs = [...(await courseDocs(courseMark)), ...(await unitDocs(unitMarks)), ...(await personDocs(personMark))];
    await upsert(docs);
    await pruneDeleted();
    if (full) await prisma.$executeRaw(Prisma.sql`DELETE FROM search_documents WHERE entity_type = 'policySection'`);
    await refreshPolicy();
    return { written: docs.length };
  })().finally(() => {
    running = null;
    lastRefreshAt = Date.now();
  });
  return running;
}

/** Refreshes first when the last refresh is older than the settings allow. */
export async function refreshIfStale(): Promise<void> {
  if (Date.now() - lastRefreshAt < SEARCH_SETTINGS.limits.refreshSeconds * 1000) return;
  await refreshSearchIndex();
}

/** For tests: forget when the last refresh ran. */
export function resetRefreshClock() {
  lastRefreshAt = 0;
}
