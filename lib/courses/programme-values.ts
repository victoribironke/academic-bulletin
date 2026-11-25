/**
 * Task B14: programme-specific course settings.
 *
 * One course code keeps one Registry record. What a programme does
 * differently (units, semester, level, core or elective) sits on the link
 * between the course and the programme, starting from the Registry's value,
 * so the same code can be 2 units in one programme and 3 in another.
 *
 * Package file 09 holds the 83 values DAP took from the programmes' own
 * credit-load tables, which win over the heading in the course description.
 * Planning is pure, so it can be checked in tests and shown as a dry run;
 * applying sets the values on the links (adding a link where the programme
 * had none) and brings open drafts in line where they still show the value
 * they started with.
 */
import type { CourseType, Prisma, PrismaClient } from "@prisma/client";
import { courseCodeKey } from "@/lib/courses/code-key";
import { isGeneralEducationCode } from "@/lib/courses/general-education";
import { recordActivity } from "@/lib/activity-log";
import { liveSubmissions } from "@/lib/cycles/archive";
import type { SpreadsheetRecord } from "@/lib/imports/spreadsheet";
import { formatCourseCode } from "@/lib/validation/name-format";

type Database = PrismaClient | Prisma.TransactionClient;

export type ProgrammeValueField = "UNITS" | "SEMESTER" | "LEVEL";

/** The link column that holds each field. */
export const FIELD_COLUMN = {
  UNITS: "unitsOverride",
  SEMESTER: "semesterOverride",
  LEVEL: "levelOverride",
} as const satisfies Record<ProgrammeValueField, string>;

/** The draft row column for each field. */
const DRAFT_COLUMN = { UNITS: "units", SEMESTER: "semester", LEVEL: "level" } as const;

const FIELD_LABEL: Record<ProgrammeValueField, string> = { UNITS: "units", SEMESTER: "semester", LEVEL: "level" };

export type LinkValues = {
  isCore?: boolean | null;
  unitsOverride?: number | null;
  semesterOverride?: number | null;
  levelOverride?: number | null;
  typeOverride?: CourseType | null;
};

type RegistryValues = { units: number; semester: number | null; level: number; type?: CourseType | null };

/** A course's units, semester, level and status in one programme: the programme's value, else the Registry's. */
export function effectiveCourseValues(master: RegistryValues, link?: LinkValues | null) {
  const type = link?.typeOverride ?? master.type ?? null;
  return {
    units: link?.unitsOverride ?? master.units,
    semester: link?.semesterOverride ?? master.semester,
    level: link?.levelOverride ?? master.level,
    status: (type === "ELECTIVE" || link?.isCore === false ? "ELECTIVE" : "CORE") as "CORE" | "ELECTIVE",
  };
}

/** One row of package file 09. */
export type ProgrammeValueRow = {
  rowNumber: number;
  programmeName: string;
  programmeCode: string;
  courseCode: string;
  courseTitle: string;
  field: ProgrammeValueField;
  registryValue: number | null;
  programmeValue: number;
};

export type ProgrammeValueNoteKind =
  | "BAD_ROW"
  | "NO_PROGRAMME"
  | "NO_COURSE"
  | "SAME_CODE_TWICE"
  | "LISTED_TWICE"
  | "REGISTRY_DIFFERS"
  | "SAME_AS_REGISTRY";

/** Notes that mean the row couldn't be matched: the "code errors" of launch test 17. */
export const CODE_ERROR_KINDS: ProgrammeValueNoteKind[] = ["BAD_ROW", "NO_PROGRAMME", "NO_COURSE", "SAME_CODE_TWICE"];

export type ProgrammeValueNote = {
  kind: ProgrammeValueNoteKind;
  rowNumber: number;
  programme: string;
  code: string;
  message: string;
};

const number = (value: unknown): number | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};

const FIELDS: Record<string, ProgrammeValueField> = { units: "UNITS", semester: "SEMESTER", level: "LEVEL" };

/** A problem with this field's value, or null when it is allowed. */
export function programmeValueProblem(field: ProgrammeValueField, value: number | null): string | null {
  if (value === null || !Number.isInteger(value)) return "is not a whole number";
  if (field === "UNITS" && (value < 0 || value > 12)) return "should be 0 to 12 units";
  if (field === "SEMESTER" && value !== 1 && value !== 2) return "should be semester 1 or 2";
  if (field === "LEVEL" && (value < 100 || value > 700 || value % 100 !== 0)) return "should be a level from 100 to 700";
  return null;
}

/** Reads file 09's rows; a row that can't be read comes back as a note. */
export function readProgrammeValueRows(records: SpreadsheetRecord[]): {
  rows: ProgrammeValueRow[];
  notes: ProgrammeValueNote[];
} {
  const rows: ProgrammeValueRow[] = [];
  const notes: ProgrammeValueNote[] = [];
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    const text = (key: string) => String(record[key] ?? "").trim();
    const programmeName = text("Programme");
    const programmeCode = text("Programme Code");
    const courseCode = formatCourseCode(text("Course Code"));
    const field = FIELDS[text("Field").toLowerCase()];
    const programmeValue = number(record["This programme uses"]);
    const bad = (message: string) =>
      notes.push({ kind: "BAD_ROW", rowNumber, programme: programmeCode || programmeName, code: courseCode, message });
    if (!programmeCode && !programmeName) return bad(`Row ${rowNumber} has no programme.`);
    if (!courseCode) return bad(`Row ${rowNumber} has no course code.`);
    if (!field) return bad(`Row ${rowNumber}: "${text("Field")}" is not Units, Semester or Level.`);
    const problem = programmeValueProblem(field, programmeValue);
    if (problem) return bad(`Row ${rowNumber}: ${courseCode} ${FIELD_LABEL[field]} "${text("This programme uses")}" ${problem}.`);
    rows.push({
      rowNumber,
      programmeName,
      programmeCode,
      courseCode,
      courseTitle: text("Course Title"),
      field,
      registryValue: number(record["Registry value"]),
      programmeValue: programmeValue!,
    });
  });
  return { rows, notes };
}

export type PlanProgramme = { id: string; code: string; name: string };
export type PlanCourse = { id: string; code: string; title: string; units: number; semester: number | null; level: number };
export type PlanLink = { id: string; programmeId: string; courseId: string } & LinkValues;

export type ProgrammeValueChange = {
  rowNumber: number;
  programmeId: string;
  programmeCode: string;
  programmeName: string;
  courseId: string;
  code: string;
  title: string;
  field: ProgrammeValueField;
  registryValue: number | null;
  /** What the link holds now (null: the Registry's value). */
  current: number | null;
  /** What the link will hold (null: the Registry's value). */
  next: number | null;
  /** The value the programme uses. */
  programmeValue: number;
  /** The link doesn't exist yet and will be added. */
  newLink: boolean;
};

export type ProgrammeValuePlan = {
  changes: ProgrammeValueChange[];
  /** Rows whose link already holds the programme's value. */
  alreadySet: number;
  notes: ProgrammeValueNote[];
  counts: { fileRows: number; matched: number; codeErrors: number };
};

const registryValueOf = (course: PlanCourse, field: ProgrammeValueField) =>
  field === "UNITS" ? course.units : field === "SEMESTER" ? course.semester : course.level;

/**
 * Matches each row to its programme (by code, an old code still in its grace
 * period, or the programme's name) and its Registry course (by code in any
 * spacing), and works out what each link should hold.
 */
export function planProgrammeValues(input: {
  rows: ProgrammeValueRow[];
  notes?: ProgrammeValueNote[];
  programmes: PlanProgramme[];
  resolveProgrammeCode?: (code: string) => string | undefined;
  courses: PlanCourse[];
  links: PlanLink[];
}): ProgrammeValuePlan {
  const notes: ProgrammeValueNote[] = [...(input.notes ?? [])];
  const changes: ProgrammeValueChange[] = [];
  const programmeById = new Map(input.programmes.map((programme) => [programme.id, programme]));
  const programmeByCode = new Map(input.programmes.map((programme) => [programme.code.trim().toUpperCase(), programme]));
  const programmeByName = new Map<string, PlanProgramme[]>();
  for (const programme of input.programmes) {
    const key = programme.name.trim().toLowerCase();
    programmeByName.set(key, [...(programmeByName.get(key) ?? []), programme]);
  }
  const coursesByKey = new Map<string, PlanCourse[]>();
  for (const course of input.courses) {
    const key = courseCodeKey(course.code);
    coursesByKey.set(key, [...(coursesByKey.get(key) ?? []), course]);
  }
  const linkByPair = new Map(input.links.map((link) => [`${link.programmeId}:${link.courseId}`, link]));
  const seen = new Map<string, ProgrammeValueRow>();
  let matched = 0;
  let alreadySet = 0;

  for (const row of input.rows) {
    const label = row.programmeCode || row.programmeName;
    const note = (kind: ProgrammeValueNoteKind, message: string) =>
      notes.push({ kind, rowNumber: row.rowNumber, programme: label, code: row.courseCode, message });

    const byCode = row.programmeCode
      ? (programmeByCode.get(row.programmeCode.toUpperCase()) ??
        programmeById.get(input.resolveProgrammeCode?.(row.programmeCode) ?? ""))
      : undefined;
    const byName = programmeByName.get(row.programmeName.toLowerCase());
    const programme = byCode ?? (byName?.length === 1 ? byName[0] : undefined);
    if (!programme) {
      note("NO_PROGRAMME", `Row ${row.rowNumber}: no programme has the code ${row.programmeCode || "(none)"} or the name "${row.programmeName}".`);
      continue;
    }

    const exact = input.courses.filter((course) => course.code === row.courseCode);
    const candidates = exact.length > 0 ? exact : (coursesByKey.get(courseCodeKey(row.courseCode)) ?? []);
    if (candidates.length === 0) {
      note("NO_COURSE", `Row ${row.rowNumber}: ${row.courseCode} isn't in the Registry.`);
      continue;
    }
    if (candidates.length > 1) {
      note(
        "SAME_CODE_TWICE",
        `Row ${row.rowNumber}: ${candidates.map((course) => course.code).join(" and ")} share this code; DAP decides which stays (B3) before this value can be set.`,
      );
      continue;
    }
    const course = candidates[0];

    const pair = `${programme.id}:${course.id}:${row.field}`;
    const first = seen.get(pair);
    if (first) {
      note(
        "LISTED_TWICE",
        first.programmeValue === row.programmeValue
          ? `Row ${row.rowNumber} repeats row ${first.rowNumber} for ${programme.code} ${course.code} ${FIELD_LABEL[row.field]}.`
          : `Row ${row.rowNumber} gives ${programme.code} ${course.code} ${FIELD_LABEL[row.field]} ${row.programmeValue}, but row ${first.rowNumber} gives ${first.programmeValue}; kept row ${first.rowNumber}.`,
      );
      continue;
    }
    seen.set(pair, row);
    matched += 1;

    const registryValue = registryValueOf(course, row.field);
    if (row.registryValue !== null && registryValue !== row.registryValue) {
      note(
        "REGISTRY_DIFFERS",
        `Row ${row.rowNumber}: the file says the Registry has ${course.code} ${FIELD_LABEL[row.field]} ${row.registryValue}; it now has ${registryValue ?? "none"}. The programme's value (${row.programmeValue}) is what counts.`,
      );
    }
    const link = linkByPair.get(`${programme.id}:${course.id}`);
    const current = (link?.[FIELD_COLUMN[row.field]] as number | null | undefined) ?? null;
    // The link holds a value only where the programme differs from the Registry.
    const next = registryValue === row.programmeValue ? null : row.programmeValue;
    if (next === null) {
      note(
        "SAME_AS_REGISTRY",
        `Row ${row.rowNumber}: the Registry already has ${course.code} ${FIELD_LABEL[row.field]} ${row.programmeValue}, as ${programme.code} uses; nothing to store.`,
      );
    }
    if (link && current === next) {
      alreadySet += 1;
      continue;
    }
    if (!link && next === null) {
      alreadySet += 1;
      continue;
    }
    changes.push({
      rowNumber: row.rowNumber,
      programmeId: programme.id,
      programmeCode: programme.code,
      programmeName: programme.name,
      courseId: course.id,
      code: course.code,
      title: course.title,
      field: row.field,
      registryValue,
      current,
      next,
      programmeValue: row.programmeValue,
      newLink: !link,
    });
  }

  const codeErrors = notes.filter((item) => CODE_ERROR_KINDS.includes(item.kind)).length;
  return { changes, alreadySet, notes, counts: { fileRows: input.rows.length + (input.notes?.length ?? 0), matched, codeErrors } };
}

/** Reads what the plan needs from the database and plans file 09's rows. */
export async function planProgrammeValuesFromDatabase(
  db: Database,
  records: SpreadsheetRecord[],
  now: Date = new Date(),
): Promise<ProgrammeValuePlan> {
  const { rows, notes } = readProgrammeValueRows(records);
  const keys = [...new Set(rows.map((row) => courseCodeKey(row.courseCode)))];
  const [programmes, aliases, allCourses] = await Promise.all([
    db.programme.findMany({ select: { id: true, code: true, name: true } }),
    db.codeAlias.findMany({ where: { kind: "PROGRAMME", validUntil: { gt: now } }, select: { oldCode: true, entityId: true } }),
    db.masterCourse.findMany({ select: { id: true, code: true, title: true, units: true, semester: true, level: true } }),
  ]);
  const wanted = new Set(keys);
  const courses = allCourses.filter((course) => wanted.has(courseCodeKey(course.code)));
  const links = courses.length
    ? await db.programmeCourse.findMany({
        where: { courseId: { in: courses.map((course) => course.id) } },
        select: {
          id: true,
          programmeId: true,
          courseId: true,
          isCore: true,
          unitsOverride: true,
          semesterOverride: true,
          levelOverride: true,
          typeOverride: true,
        },
      })
    : [];
  const aliasByCode = new Map(aliases.map((alias) => [alias.oldCode.toUpperCase(), alias.entityId]));
  return planProgrammeValues({
    rows,
    notes,
    programmes,
    resolveProgrammeCode: (code) => aliasByCode.get(code.trim().toUpperCase()),
    courses,
    links,
  });
}

const EDITABLE = ["DRAFT", "CORRECTIONS_REQUIRED"] as const;

/**
 * Sets the planned values on the links (adding missing links), then brings
 * the programme's open drafts in line: a row still showing the Registry's
 * value (or, for a General Education row, which Heads can't edit, any other
 * value) takes the programme's value. A value a Head chose is left alone, and
 * so is every draft in an archived cycle, or one under review or approved.
 */
export async function applyProgrammeValues(
  db: PrismaClient,
  plan: ProgrammeValuePlan,
  options: { actorId?: string | null } = {},
): Promise<{ linksUpdated: number; linksAdded: number; draftRowsUpdated: number }> {
  if (plan.changes.length === 0) return { linksUpdated: 0, linksAdded: 0, draftRowsUpdated: 0 };
  const byLink = new Map<string, ProgrammeValueChange[]>();
  for (const change of plan.changes) {
    const key = `${change.programmeId}:${change.courseId}`;
    byLink.set(key, [...(byLink.get(key) ?? []), change]);
  }
  return db.$transaction(
    async (tx) => {
      let linksUpdated = 0;
      let linksAdded = 0;
      let draftRowsUpdated = 0;
      for (const changes of byLink.values()) {
        const { programmeId, courseId } = changes[0];
        const data = Object.fromEntries(changes.map((change) => [FIELD_COLUMN[change.field], change.next]));
        const existing = await tx.programmeCourse.findUnique({
          where: { programmeId_courseId: { programmeId, courseId } },
          select: { id: true },
        });
        if (existing) {
          await tx.programmeCourse.update({ where: { id: existing.id }, data });
          linksUpdated += 1;
        } else {
          await tx.programmeCourse.create({
            data: { programmeId, courseId, isCore: true, sourceReference: "Package file 09 (B14)", ...data },
          });
          linksAdded += 1;
        }
        for (const change of changes) {
          const column = DRAFT_COLUMN[change.field];
          const updated = await tx.course.updateMany({
            where: {
              code: change.code,
              submission: liveSubmissions({ programmeId, status: { in: [...EDITABLE] } }),
              ...(isGeneralEducationCode(change.code)
                ? { NOT: { [column]: change.programmeValue } }
                : { [column]: change.registryValue }),
            },
            data: { [column]: change.programmeValue },
          });
          draftRowsUpdated += updated.count;
        }
      }
      const programmes = new Set(plan.changes.map((change) => change.programmeCode));
      await recordActivity(
        {
          actorId: options.actorId,
          action: "PROGRAMME_VALUES_LOADED",
          entityType: "MASTER_COURSE",
          description: `Loaded ${plan.changes.length} programme-specific course values (package file 09, B14) for ${programmes.size} programmes; ${draftRowsUpdated} open draft rows brought in line.`,
          metadata: {
            task: "B14",
            changes: plan.changes.length,
            linksUpdated,
            linksAdded,
            draftRowsUpdated,
            programmes: [...programmes].sort(),
          },
        },
        tx,
      );
      return { linksUpdated, linksAdded, draftRowsUpdated };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}

/** Each programme's own values for its courses, by course code (for the draft pre-fill). */
export async function loadProgrammeValues(
  db: Database,
  programmeId: string,
): Promise<Map<string, { units: number | null; semester: number | null; level: number | null }>> {
  const links = await db.programmeCourse.findMany({
    where: {
      programmeId,
      OR: [{ unitsOverride: { not: null } }, { semesterOverride: { not: null } }, { levelOverride: { not: null } }],
    },
    select: { unitsOverride: true, semesterOverride: true, levelOverride: true, course: { select: { code: true } } },
  });
  return new Map(
    links.map((link) => [
      link.course.code,
      { units: link.unitsOverride, semester: link.semesterOverride, level: link.levelOverride },
    ]),
  );
}

/** The dry-run or applied report, for DAP. */
export function programmeValuesReport(plan: ProgrammeValuePlan, heading: string): string {
  const lines = [`# ${heading}`, ""];
  const byKind = (kind: ProgrammeValueNoteKind) => plan.notes.filter((note) => note.kind === kind);
  lines.push(
    `- Rows in file 09: ${plan.counts.fileRows}`,
    `- Matched to a programme and a Registry course: ${plan.counts.matched}`,
    `- Rows with code errors: ${plan.counts.codeErrors}`,
    `- Values to store on the programme link: ${plan.changes.length} (${plan.changes.filter((change) => change.newLink).length} on links to add)`,
    `- Already stored: ${plan.alreadySet}`,
    "",
    "Each value sits on the link between the course and the programme, so the Registry keeps one record per code. Open drafts outside archived cycles take the programme's value where the row still shows the Registry's (General Education rows, which Heads can't edit, always do). Drafts under review or approved, and archived cycles, are left alone.",
    "",
  );
  if (plan.changes.length) {
    lines.push("## Values to store", "", "| Row | Programme | Course | Field | Registry | Programme uses | Link now |", "| --- | --- | --- | --- | --- | --- | --- |");
    for (const change of plan.changes) {
      lines.push(
        `| ${change.rowNumber} | ${change.programmeCode} ${change.programmeName} | ${change.code} ${change.title} | ${FIELD_LABEL[change.field]} | ${change.registryValue ?? "none"} | ${change.programmeValue} | ${change.newLink ? "no link yet" : (change.current ?? "Registry's")} |`,
      );
    }
    lines.push("");
  }
  const sections: [ProgrammeValueNoteKind, string][] = [
    ["BAD_ROW", "Rows that can't be read"],
    ["NO_PROGRAMME", "Programmes not found"],
    ["NO_COURSE", "Courses not in the Registry"],
    ["SAME_CODE_TWICE", "Codes held by two Registry records (B3)"],
    ["LISTED_TWICE", "Rows listed twice"],
    ["REGISTRY_DIFFERS", "The Registry has changed since the file was made"],
    ["SAME_AS_REGISTRY", "The Registry already has the programme's value"],
  ];
  for (const [kind, title] of sections) {
    const notes = byKind(kind);
    if (!notes.length) continue;
    lines.push(`## ${title} (${notes.length})`, "", ...notes.map((note) => `- ${note.message}`), "");
  }
  return lines.join("\n").trim();
}
