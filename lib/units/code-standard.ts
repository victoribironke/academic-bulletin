/**
 * The code and name standard for schools, departments and programmes,
 * adopted by DAP on November 23, 2026 (work order section 1.1, task A5),
 * with the programme records of tasks B15 and B18.
 *
 * `planCodeStandard` compares the standard (package file 10) with what the
 * platform holds and lists every change; `applyCodeStandard` makes them in
 * one transaction. Record IDs never change, so no history is lost, and each
 * changed code is kept as an alias until the end of Departmental Drafting.
 * Running it again changes nothing.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

/** Old codes are accepted, with a warning, until the end of Departmental Drafting. */
export const ALIAS_VALID_UNTIL = new Date("2027-02-04T23:59:59+01:00");

/** Programme lengths that differ from the 4-year default (section 6.3, B15/DEC16). */
export const PROGRAMME_LENGTHS: Record<string, number> = {
  "SBMS-DEN-BDS": 6,
  "SSAT-AIT-FST": 5,
  "SESC-ARC-ARC": 4,
  "SESC-ESM-ESM": 5,
  "SAHS-NUT-NUT": 5,
};
/** Lengths the bulletin fixes for existing programmes (B15, decision DEC16). */
export const B15_LENGTHS = ["SESC-ARC-ARC", "SESC-ESM-ESM", "SAHS-NUT-NUT"];
/** Added but kept from Heads of Department until DAP confirms them (B15). */
export const HIDDEN_PROGRAMMES = ["JSEH-REL-CRS", "VSSS-PSP-ILD"];
export const DEFAULT_PROGRAMME_LENGTH = 4;

export type StandardSchool = { oldCode: string | null; code: string; name: string; reserved: boolean };
export type StandardDepartment = {
  oldCode: string | null;
  code: string;
  schoolCode: string;
  name: string;
  /** The standard's name is a suggestion DAP still has to check. */
  nameToConfirm?: boolean;
};
export type StandardProgramme = {
  oldCode: string | null;
  code: string;
  departmentCode: string;
  officialName: string;
  isNewProgramme: boolean;
};
export type OwnershipMove = { prefix: string; departmentCode: string; schoolCode: string };

export type CodeStandard = {
  schools: StandardSchool[];
  departments: StandardDepartment[];
  programmes: StandardProgramme[];
  ownershipMoves: OwnershipMove[];
};

export type PlatformSnapshot = {
  schools: { id: string; code: string; name: string }[];
  departments: { id: string; code: string; name: string; schoolId: string }[];
  programmes: {
    id: string;
    code: string;
    name: string;
    degreeType: string | null;
    duration: number | null;
    departmentId: string;
    isHidden: boolean;
    isNew: boolean;
  }[];
  courses: { id: string; code: string; ownerDeptId: string | null; ownerSchoolId: string | null }[];
};

/**
 * "B.Sc. (Hons.) Human Nutrition and Dietetics" -> degree "B.Sc.",
 * discipline "Human Nutrition and Dietetics". MBBS and BDS have no "(Hons.)".
 */
export function splitOfficialName(officialName: string): { degree: string; discipline: string } {
  const match = officialName.trim().match(/^(\S+)\s+(?:\(Hons\.\)\s+)?(.+)$/);
  if (!match) return { degree: "", discipline: officialName.trim() };
  return { degree: match[1], discipline: match[2].trim() };
}

/** "B.Sc. (Hons.) Accounting"; "MBBS Medicine and Surgery". */
export function officialProgrammeName(programme: { degreeType: string | null; name: string }): string {
  const degree = programme.degreeType?.trim();
  if (!degree) return programme.name;
  return ["MBBS", "BDS"].includes(degree) ? `${degree} ${programme.name}` : `${degree} (Hons.) ${programme.name}`;
}

type Change<T> = {
  id: string | null;
  action: "create" | "update" | "unchanged";
  before: T | null;
  after: T;
};

export type SchoolState = { code: string; name: string };
export type DepartmentState = { code: string; name: string; schoolCode: string };
export type ProgrammeState = {
  code: string;
  name: string;
  degreeType: string | null;
  duration: number | null;
  departmentCode: string;
  isHidden: boolean;
  isNew: boolean;
};

export type CodeStandardPlan = {
  schools: Change<SchoolState>[];
  departments: Change<DepartmentState>[];
  programmes: Change<ProgrammeState>[];
  aliases: { kind: "SCHOOL" | "DEPARTMENT" | "PROGRAMME"; oldCode: string; newCode: string; entityId: string | null }[];
  courseMoves: { prefix: string; departmentCode: string; courseIds: string[]; courseCodes: string[] }[];
  /** Records the platform holds that the standard does not mention, and rows that could not be matched. */
  problems: string[];
};

const same = <T extends object>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

export function planCodeStandard(
  standard: CodeStandard,
  platform: PlatformSnapshot,
  /** Department codes whose "(name to confirm)" DAP has confirmed: the standard's name is used. */
  options: { confirmedNames?: string[] } = {},
): CodeStandardPlan {
  const confirmedNames = new Set((options.confirmedNames ?? []).map((code) => code.trim().toUpperCase()).filter(Boolean));
  const problems: string[] = [];
  const aliases: CodeStandardPlan["aliases"] = [];

  // Schools
  const schoolById = new Map(platform.schools.map((school) => [school.id, school]));
  const schoolByCode = new Map(platform.schools.map((school) => [school.code.toUpperCase(), school]));
  const newSchoolCodeById = new Map<string, string>();
  const schools: CodeStandardPlan["schools"] = [];
  const seenSchoolIds = new Set<string>();
  for (const row of standard.schools) {
    if (row.reserved) continue;
    const existing =
      (row.oldCode && schoolByCode.get(row.oldCode.toUpperCase())) || schoolByCode.get(row.code.toUpperCase());
    const after = { code: row.code, name: row.name };
    if (!existing) {
      problems.push(`School ${row.code} (${row.name}) is not on the platform; it is left for DAP to add.`);
      continue;
    }
    seenSchoolIds.add(existing.id);
    newSchoolCodeById.set(existing.id, row.code);
    const before = { code: existing.code, name: existing.name };
    schools.push({ id: existing.id, action: same(before, after) ? "unchanged" : "update", before, after });
    if (existing.code !== row.code) aliases.push({ kind: "SCHOOL", oldCode: existing.code, newCode: row.code, entityId: existing.id });
  }
  for (const school of platform.schools) {
    if (!seenSchoolIds.has(school.id)) problems.push(`School ${school.code} (${school.name}) is not in the standard; left as it is.`);
  }

  // Departments
  const departmentByCode = new Map(platform.departments.map((department) => [department.code.toUpperCase(), department]));
  const departmentById = new Map(platform.departments.map((department) => [department.id, department]));
  const oldSchoolCode = new Map(standard.schools.filter((s) => s.oldCode).map((s) => [s.code, s.oldCode!]));
  const newDepartmentCodeById = new Map<string, string>();
  const departments: CodeStandardPlan["departments"] = [];
  const seenDepartmentIds = new Set<string>();
  for (const row of standard.departments) {
    const oldFull = row.oldCode ? `${oldSchoolCode.get(row.schoolCode) ?? row.schoolCode}-${row.oldCode}` : null;
    const existing =
      (oldFull && departmentByCode.get(oldFull.toUpperCase())) || departmentByCode.get(row.code.toUpperCase());
    if (!existing) {
      const after = { code: row.code, name: row.name, schoolCode: row.schoolCode };
      departments.push({ id: null, action: "create", before: null, after });
      continue;
    }
    // A name still to confirm never replaces the name the platform has,
    // unless DAP has confirmed it.
    const keepName = Boolean(row.nameToConfirm) && existing.name !== row.name && !confirmedNames.has(row.code.toUpperCase());
    if (keepName) {
      problems.push(
        `Department ${row.code}: the platform calls it "${existing.name}"; the standard suggests "${row.name}" (to confirm). The platform name is kept until DAP decides.`,
      );
    }
    const after = { code: row.code, name: keepName ? existing.name : row.name, schoolCode: row.schoolCode };
    seenDepartmentIds.add(existing.id);
    newDepartmentCodeById.set(existing.id, row.code);
    const before = {
      code: existing.code,
      name: existing.name,
      schoolCode: schoolById.get(existing.schoolId)?.code ?? "?",
    };
    departments.push({ id: existing.id, action: same(before, after) ? "unchanged" : "update", before, after });
    if (existing.code !== row.code) aliases.push({ kind: "DEPARTMENT", oldCode: existing.code, newCode: row.code, entityId: existing.id });
  }
  for (const code of confirmedNames) {
    if (!standard.departments.some((row) => row.code.toUpperCase() === code && row.nameToConfirm)) {
      problems.push(`${code} was given as a confirmed name, but the standard has no department name to confirm with that code.`);
    }
  }
  for (const department of platform.departments) {
    if (!seenDepartmentIds.has(department.id)) {
      problems.push(`Department ${department.code} (${department.name}) is not in the standard; left as it is.`);
    }
  }

  // Programmes
  const programmeByCode = new Map(platform.programmes.map((programme) => [programme.code.toUpperCase(), programme]));
  const programmes: CodeStandardPlan["programmes"] = [];
  const seenProgrammeIds = new Set<string>();
  for (const row of standard.programmes) {
    const existing =
      (row.oldCode && programmeByCode.get(row.oldCode.toUpperCase())) || programmeByCode.get(row.code.toUpperCase());
    const { degree, discipline } = splitOfficialName(row.officialName);
    const hidden = HIDDEN_PROGRAMMES.includes(row.code);
    const lengthRule = PROGRAMME_LENGTHS[row.code];
    if (!existing) {
      if (!row.isNewProgramme) {
        problems.push(`Programme ${row.oldCode ?? row.code} (${row.officialName}) should already be on the platform but is not; it is created.`);
      }
      programmes.push({
        id: null,
        action: "create",
        before: null,
        after: {
          code: row.code,
          name: discipline,
          degreeType: degree || null,
          duration: lengthRule ?? DEFAULT_PROGRAMME_LENGTH,
          departmentCode: row.departmentCode,
          isHidden: hidden,
          isNew: row.isNewProgramme && !hidden,
        },
      });
      continue;
    }
    seenProgrammeIds.add(existing.id);
    const department = departmentById.get(existing.departmentId);
    const before: ProgrammeState = {
      code: existing.code,
      name: existing.name,
      degreeType: existing.degreeType,
      duration: existing.duration,
      departmentCode: department?.code ?? "?",
      isHidden: existing.isHidden,
      isNew: existing.isNew,
    };
    const after: ProgrammeState = {
      code: row.code,
      name: discipline,
      degreeType: degree || existing.degreeType,
      duration: B15_LENGTHS.includes(row.code) || existing.duration === null ? (lengthRule ?? DEFAULT_PROGRAMME_LENGTH) : existing.duration,
      departmentCode: row.departmentCode,
      isHidden: existing.isHidden || hidden,
      isNew: existing.isNew || (row.isNewProgramme && !hidden),
    };
    programmes.push({ id: existing.id, action: same(before, after) ? "unchanged" : "update", before, after });
    if (existing.code !== row.code) aliases.push({ kind: "PROGRAMME", oldCode: existing.code, newCode: row.code, entityId: existing.id });
  }
  for (const programme of platform.programmes) {
    if (!seenProgrammeIds.has(programme.id)) {
      problems.push(`Programme ${programme.code} (${programme.name}) is not in the standard; left as it is.`);
    }
  }

  // Course ownership moves (section 1.1): by exact course prefix.
  const targetDepartment = (code: string) =>
    platform.departments.find((d) => (newDepartmentCodeById.get(d.id) ?? d.code) === code);
  const courseMoves: CodeStandardPlan["courseMoves"] = [];
  for (const move of standard.ownershipMoves) {
    const pattern = new RegExp(`^${move.prefix.replace(/[-]/g, "\\-")} \\d`);
    const owner = targetDepartment(move.departmentCode);
    const courses = platform.courses.filter((course) => pattern.test(course.code) && course.ownerDeptId !== (owner?.id ?? "__new__"));
    if (!owner && !departments.some((d) => d.action === "create" && d.after.code === move.departmentCode)) {
      problems.push(`Courses starting ${move.prefix} should move to ${move.departmentCode}, which is not on the platform.`);
      continue;
    }
    courseMoves.push({
      prefix: move.prefix,
      departmentCode: move.departmentCode,
      courseIds: courses.map((course) => course.id),
      courseCodes: courses.map((course) => course.code),
    });
  }

  return { schools, departments, programmes, aliases, courseMoves, problems };
}

export function planHasChanges(plan: CodeStandardPlan): boolean {
  return (
    [...plan.schools, ...plan.departments, ...plan.programmes].some((change) => change.action !== "unchanged") ||
    plan.courseMoves.some((move) => move.courseIds.length > 0)
  );
}

/** A plain-words report of the plan, for DAP and for the record. */
export function describeCodeStandardPlan(plan: CodeStandardPlan, title: string): string {
  const lines: string[] = [`# ${title}`, ""];
  const count = (changes: { action: string }[], action: string) => changes.filter((c) => c.action === action).length;
  lines.push(
    `- Schools: ${count(plan.schools, "update")} changed, ${count(plan.schools, "unchanged")} already right.`,
    `- Departments: ${count(plan.departments, "update")} changed, ${count(plan.departments, "create")} added, ${count(plan.departments, "unchanged")} already right.`,
    `- Programmes: ${count(plan.programmes, "update")} changed, ${count(plan.programmes, "create")} added, ${count(plan.programmes, "unchanged")} already right.`,
    `- Old codes kept as aliases until February 4, 2027: ${plan.aliases.length}.`,
    `- Courses changing owner: ${plan.courseMoves.reduce((sum, move) => sum + move.courseIds.length, 0)}.`,
    "",
  );
  const section = <T>(heading: string, changes: Change<T>[], show: (state: T) => string) => {
    const changed = changes.filter((change) => change.action !== "unchanged");
    if (changed.length === 0) return;
    lines.push(`## ${heading}`, "", "| | Before | After |", "|---|---|---|");
    for (const change of changed) {
      lines.push(`| ${change.action === "create" ? "Add" : "Change"} | ${change.before ? show(change.before) : "-"} | ${show(change.after)} |`);
    }
    lines.push("");
  };
  section("Schools", plan.schools, (s) => `${s.code}: ${s.name}`);
  section("Departments", plan.departments, (d) => `${d.code}: ${d.name} (${d.schoolCode})`);
  section("Programmes", plan.programmes, (p) => {
    const flags = [p.isHidden ? "hidden" : "", p.isNew ? "new programme" : ""].filter(Boolean).join(", ");
    return `${p.code}: ${officialProgrammeName(p)}, ${p.duration ?? "?"} years, in ${p.departmentCode}${flags ? ` (${flags})` : ""}`;
  });
  const moves = plan.courseMoves.filter((move) => move.courseIds.length > 0);
  if (moves.length > 0) {
    lines.push("## Courses changing owner", "", "| Courses starting | New owner | How many | Codes |", "|---|---|---|---|");
    for (const move of moves) {
      lines.push(`| ${move.prefix} | ${move.departmentCode} | ${move.courseIds.length} | ${move.courseCodes.slice(0, 12).join(", ")}${move.courseCodes.length > 12 ? ", ..." : ""} |`);
    }
    lines.push("");
  }
  if (plan.problems.length > 0) {
    lines.push("## For DAP to look at", "", ...plan.problems.map((problem) => `- ${problem}`), "");
  }
  return lines.join("\n");
}

export async function readPlatformSnapshot(db: PrismaClient | Prisma.TransactionClient): Promise<PlatformSnapshot> {
  const [schools, departments, programmes, courses] = await Promise.all([
    db.school.findMany({ select: { id: true, code: true, name: true } }),
    db.department.findMany({ select: { id: true, code: true, name: true, schoolId: true } }),
    db.programme.findMany({
      select: { id: true, code: true, name: true, degreeType: true, duration: true, departmentId: true, isHidden: true, isNew: true },
    }),
    db.masterCourse.findMany({ select: { id: true, code: true, ownerDeptId: true, ownerSchoolId: true } }),
  ]);
  return { schools, departments, programmes, courses };
}

/**
 * Makes every change in the plan, in the order that keeps each step valid:
 * schools, departments, programmes, aliases, course owners. Returns the
 * number of records changed.
 */
export async function applyCodeStandard(
  tx: Prisma.TransactionClient,
  plan: CodeStandardPlan,
): Promise<{ changed: number }> {
  let changed = 0;
  const schoolIdByCode = new Map<string, string>();
  for (const change of plan.schools) {
    schoolIdByCode.set(change.after.code, change.id!);
    if (change.action === "update") {
      await tx.school.update({ where: { id: change.id! }, data: { code: change.after.code, name: change.after.name } });
      changed += 1;
    }
  }

  const departmentIdByCode = new Map<string, string>();
  for (const change of plan.departments) {
    const schoolId = schoolIdByCode.get(change.after.schoolCode);
    if (!schoolId) throw new Error(`Department ${change.after.code} needs school ${change.after.schoolCode}, which is not on the platform.`);
    const data = { code: change.after.code, name: change.after.name, schoolId };
    if (change.action === "create") {
      const created = await tx.department.create({ data, select: { id: true } });
      departmentIdByCode.set(change.after.code, created.id);
      changed += 1;
    } else {
      departmentIdByCode.set(change.after.code, change.id!);
      if (change.action === "update") {
        await tx.department.update({ where: { id: change.id! }, data });
        changed += 1;
      }
    }
  }

  const programmeIdByCode = new Map<string, string>();
  for (const change of plan.programmes) {
    const departmentId = departmentIdByCode.get(change.after.departmentCode);
    if (!departmentId) throw new Error(`Programme ${change.after.code} needs department ${change.after.departmentCode}, which is not on the platform.`);
    const data = {
      code: change.after.code,
      name: change.after.name,
      degreeType: change.after.degreeType,
      duration: change.after.duration,
      departmentId,
      isHidden: change.after.isHidden,
      isNew: change.after.isNew,
    };
    if (change.action === "create") {
      const created = await tx.programme.create({ data, select: { id: true } });
      programmeIdByCode.set(change.after.code, created.id);
      changed += 1;
    } else if (change.action === "update") {
      await tx.programme.update({ where: { id: change.id! }, data });
      programmeIdByCode.set(change.after.code, change.id!);
      changed += 1;
    }
  }

  for (const alias of plan.aliases) {
    const entityId = alias.entityId!;
    await tx.codeAlias.upsert({
      where: { kind_oldCode: { kind: alias.kind, oldCode: alias.oldCode } },
      create: { kind: alias.kind, oldCode: alias.oldCode, newCode: alias.newCode, entityId, validUntil: ALIAS_VALID_UNTIL },
      update: { newCode: alias.newCode, entityId, validUntil: ALIAS_VALID_UNTIL },
    });
  }

  for (const move of plan.courseMoves) {
    if (move.courseIds.length === 0) continue;
    const departmentId = departmentIdByCode.get(move.departmentCode);
    if (!departmentId) throw new Error(`Courses starting ${move.prefix} need department ${move.departmentCode}.`);
    const result = await tx.masterCourse.updateMany({
      where: { id: { in: move.courseIds } },
      data: { ownerDeptId: departmentId, ownerSchoolId: null, ownership: "DEPARTMENT" },
    });
    changed += result.count;
  }

  return { changed };
}
