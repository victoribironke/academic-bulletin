/**
 * Importing the roster (work order task D2) from the D1 template: Deans,
 * Heads of Department, programme coordinators, DAP officers and the General
 * Education desk.
 *
 * - Only babcock.edu.ng addresses.
 * - Each person is linked to their school, department or programme by code
 *   (an old code is accepted with a warning until February 4, 2027).
 * - An email listed twice is refused, except a programme coordinator listed
 *   for several programmes of one department; every problem is reported by
 *   sheet and row, and nothing is imported while any row has one.
 * - Someone already on the platform is updated to match the roster, except
 *   a Super Administrator, who is never changed by an import.
 * - Rows with no name and no email are the template's unfilled lines.
 *
 * Importing sends no email: invitations go out separately (task D3).
 */
import type { Prisma, UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { isUniversityEmail, normalizeEmail, UNIVERSITY_DOMAIN } from "@/lib/sign-in-access";
import type { CodeLookup } from "@/lib/units/code-aliases";

export type RosterSheet = "Deans" | "Heads of Department" | "Programme coordinators" | "DAP officers" | "General Education desk";

export type RosterRow = {
  sheet: RosterSheet;
  rowNumber: number;
  unitCode: string;
  title: string;
  fullName: string;
  email: string;
  acting: string;
  whatsapp: string;
};

export type RosterRole = Extract<UserRole, "DEAN" | "HOD" | "PROGRAMME_COORDINATOR" | "ADMIN">;

const ROLE_BY_SHEET: Record<RosterSheet, RosterRole> = {
  Deans: "DEAN",
  "Heads of Department": "HOD",
  "Programme coordinators": "PROGRAMME_COORDINATOR",
  // DAP runs the General Education desk until it names a unit (DEC8).
  "DAP officers": "ADMIN",
  "General Education desk": "ADMIN",
};

export type PersonPlan = {
  sheet: RosterSheet;
  rowNumber: number;
  email: string;
  title: string | null;
  firstName: string;
  lastName: string;
  role: RosterRole;
  isActing: boolean;
  whatsapp: string | null;
  schoolId: string | null;
  departmentId: string | null;
  /** A coordinator's programmes (one or more); empty for everyone else. */
  programmeIds: string[];
  unitLabel: string;
  existingUserId: string | null;
  action: "create" | "update" | "unchanged";
  changes: string[];
  warnings: string[];
};

export type RosterPlan = {
  people: PersonPlan[];
  problems: { sheet: RosterSheet; rowNumber: number; message: string }[];
  blankRows: number;
};

export type RosterPlatform = {
  schools: { id: string; code: string; name: string }[];
  departments: { id: string; code: string; name: string; schoolId: string }[];
  programmes: { id: string; code: string; name: string; departmentId: string }[];
  users: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    isActive: boolean;
    title: string | null;
    whatsapp: string | null;
    isActing: boolean;
    schoolId: string | null;
    departmentId: string | null;
    programmeIds: string[];
  }[];
  lookups: { school: CodeLookup; department: CodeLookup; programme: CodeLookup };
};

/** "Adaeze Grace Okafor" -> first "Adaeze Grace", last "Okafor"; "Okafor, Adaeze" -> first "Adaeze", last "Okafor". */
export function splitFullName(fullName: string): { firstName: string; lastName: string } | null {
  const clean = fullName.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  if (clean.includes(",")) {
    const [last, ...rest] = clean.split(",");
    const first = rest.join(" ").trim();
    return first && last.trim() ? { firstName: first, lastName: last.trim() } : null;
  }
  const words = clean.split(" ");
  if (words.length < 2) return null;
  return { firstName: words.slice(0, -1).join(" "), lastName: words.at(-1)! };
}

/** "+234 803 123 4567" -> "+2348031234567"; "0803..." -> "+234803..."; null when not a phone number. */
export function normalizeWhatsapp(value: string): string | null | undefined {
  const digits = value.replace(/[\s().-]/g, "");
  if (!digits) return null;
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  return undefined;
}

export function planRoster(rows: RosterRow[], platform: RosterPlatform): RosterPlan {
  const problems: RosterPlan["problems"] = [];
  const people: PersonPlan[] = [];
  let blankRows = 0;

  const filled = rows.filter((row) => {
    const blank = !row.email.trim() && !row.fullName.trim();
    if (blank) blankRows += 1;
    return !blank;
  });

  // An email listed twice is refused on every row it appears.
  const rowsByEmail = new Map<string, RosterRow[]>();
  for (const row of filled) {
    const email = normalizeEmail(row.email);
    if (email) rowsByEmail.set(email, [...(rowsByEmail.get(email) ?? []), row]);
  }

  const schoolById = new Map(platform.schools.map((school) => [school.id, school]));
  const departmentById = new Map(platform.departments.map((department) => [department.id, department]));
  const programmeById = new Map(platform.programmes.map((programme) => [programme.id, programme]));
  const userByEmail = new Map(platform.users.map((user) => [normalizeEmail(user.email), user]));

  for (const row of filled) {
    const issues: string[] = [];
    const warnings: string[] = [];
    const email = normalizeEmail(row.email);
    const role = ROLE_BY_SHEET[row.sheet];

    if (!email) issues.push("The email is missing.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push(`"${row.email}" is not an email address.`);
    else if (!isUniversityEmail(email)) issues.push(`${email} is not a ${UNIVERSITY_DOMAIN} address.`);
    const duplicates = email ? (rowsByEmail.get(email) ?? []) : [];
    const coordinatorOfSeveral = duplicates.every((item) => item.sheet === "Programme coordinators");
    if (duplicates.length > 1 && !coordinatorOfSeveral) {
      issues.push(
        `${email} is listed ${duplicates.length} times (${duplicates.map((item) => `${item.sheet} row ${item.rowNumber}`).join(", ")}); each person once.`,
      );
    }
    const name = splitFullName(row.fullName);
    if (!name) issues.push(`Give the full name, first name(s) and surname ("${row.fullName.trim()}").`);

    const whatsapp = normalizeWhatsapp(row.whatsapp);
    if (whatsapp === undefined) issues.push(`"${row.whatsapp}" is not a phone number; write it as +234 803 123 4567.`);
    const actingText = row.acting.trim().toLowerCase();
    if (actingText && !["yes", "no", "y", "n"].includes(actingText)) issues.push('Acting must be "Yes" or "No".');

    // The unit, by code.
    let schoolId: string | null = null;
    let departmentId: string | null = null;
    let programmeId: string | null = null;
    let unitLabel = row.sheet === "General Education desk" ? "General Education desk" : "";
    const code = row.unitCode.trim();
    if (row.sheet !== "General Education desk") {
      const lookup =
        row.sheet === "Heads of Department"
          ? platform.lookups.department
          : row.sheet === "Programme coordinators"
            ? platform.lookups.programme
            : platform.lookups.school;
      const found = code ? lookup.resolve(code) : undefined;
      if (!found) issues.push(code ? `No unit has the code ${code}.` : "The unit code is missing.");
      else {
        if (found.warning) warnings.push(found.warning);
        if (row.sheet === "Heads of Department") {
          const department = departmentById.get(found.id)!;
          departmentId = department.id;
          schoolId = department.schoolId;
          unitLabel = `${department.code} ${department.name}`;
        } else if (row.sheet === "Programme coordinators") {
          const programme = programmeById.get(found.id)!;
          programmeId = programme.id;
          departmentId = programme.departmentId;
          schoolId = departmentById.get(programme.departmentId)?.schoolId ?? null;
          unitLabel = `${programme.code} ${programme.name}`;
        } else {
          const school = schoolById.get(found.id)!;
          unitLabel = `${school.code} ${school.name}`;
          // Deans belong to their school; a DAP officer is named for one, and
          // the invitations give that officer as the school's help (D3).
          schoolId = school.id;
        }
      }
    }

    const existing = email ? userByEmail.get(email) : undefined;
    if (existing?.role === "SUPER_ADMIN") {
      issues.push(`${email} is a Super Administrator; an import never changes that account.`);
    }

    if (issues.length > 0 || !name) {
      for (const message of issues) problems.push({ sheet: row.sheet, rowNumber: row.rowNumber, message });
      continue;
    }

    const planned = {
      title: row.title.trim() || null,
      firstName: name.firstName,
      lastName: name.lastName,
      role,
      isActing: ["yes", "y"].includes(actingText),
      whatsapp: whatsapp ?? null,
      schoolId,
      departmentId,
      programmeIds: programmeId ? [programmeId] : [],
    };

    // A coordinator listed again for another programme joins the first row.
    const earlier = people.find((person) => person.email === email);
    if (earlier) {
      if (earlier.departmentId !== departmentId) {
        problems.push({
          sheet: row.sheet,
          rowNumber: row.rowNumber,
          message: `${email} coordinates programmes in two departments (also row ${earlier.rowNumber}); a coordinator works in one department.`,
        });
        continue;
      }
      earlier.programmeIds.push(...planned.programmeIds);
      earlier.unitLabel = `${earlier.unitLabel}; ${unitLabel}`;
      if (earlier.existingUserId && programmeId && !platform.users.find((user) => user.id === earlier.existingUserId)?.programmeIds.includes(programmeId)) {
        earlier.changes.push("programme");
        earlier.action = "update";
      }
      continue;
    }
    const changes: string[] = [];
    if (existing) {
      if (existing.role !== role) changes.push(`role ${existing.role} to ${role}`);
      if (existing.schoolId !== schoolId) changes.push("school");
      if (existing.departmentId !== departmentId) changes.push("department");
      if (programmeId && !existing.programmeIds.includes(programmeId)) changes.push("programme");
      if (!programmeId && existing.programmeIds.length > 0) changes.push("programmes removed");
      if (existing.firstName !== planned.firstName || existing.lastName !== planned.lastName) changes.push("name");
      if ((existing.title ?? null) !== planned.title) changes.push("title");
      if ((existing.whatsapp ?? null) !== planned.whatsapp) changes.push("WhatsApp number");
      if (existing.isActing !== planned.isActing) changes.push("acting");
      if (!existing.isActive) changes.push("reactivated");
    }
    people.push({
      sheet: row.sheet,
      rowNumber: row.rowNumber,
      email,
      ...planned,
      unitLabel,
      existingUserId: existing?.id ?? null,
      action: existing ? (changes.length ? "update" : "unchanged") : "create",
      changes,
      warnings,
    });
  }

  return { people, problems, blankRows };
}

/** A plain-words report for DAP: counts, then every problem by sheet and row. */
export function describeRosterPlan(plan: RosterPlan, title: string): string {
  const count = (action: PersonPlan["action"]) => plan.people.filter((person) => person.action === action).length;
  const lines = [
    `# ${title}`,
    "",
    `- People ready: ${plan.people.length} (${count("create")} new, ${count("update")} changed, ${count("unchanged")} already right).`,
    `- Problems: ${plan.problems.length}${plan.problems.length ? " (nothing is imported until they are fixed)" : ""}.`,
    `- Unfilled template lines skipped: ${plan.blankRows}.`,
    "",
  ];
  if (plan.problems.length > 0) {
    lines.push("## Problems to fix in the roster", "", "| Sheet | Row | Problem |", "|---|---|---|");
    for (const problem of plan.problems) lines.push(`| ${problem.sheet} | ${problem.rowNumber} | ${problem.message} |`);
    lines.push("");
  }
  if (plan.people.length > 0) {
    lines.push("## People", "", "| Sheet | Row | Name | Email | Role | Unit | What happens |", "|---|---|---|---|---|---|---|");
    for (const person of plan.people) {
      const what =
        person.action === "create"
          ? "Added"
          : person.action === "update"
            ? `Changed: ${person.changes.join(", ")}`
            : "Already right";
      const name = [person.title, person.firstName, person.lastName].filter(Boolean).join(" ");
      lines.push(
        `| ${person.sheet} | ${person.rowNumber} | ${name}${person.isActing ? " (acting)" : ""} | ${person.email} | ${person.role} | ${person.unitLabel} | ${what}${person.warnings.length ? `; ${person.warnings.join(" ")}` : ""} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Creates and updates everyone in the plan. Run inside a transaction. */
export async function applyRoster(
  tx: Prisma.TransactionClient,
  plan: RosterPlan,
  actorId: string | null,
): Promise<{ created: number; updated: number }> {
  if (plan.problems.length > 0) throw new Error("The roster has problems; fix them first.");
  let created = 0;
  let updated = 0;
  for (const person of plan.people) {
    if (person.action === "unchanged") continue;
    const data = {
      email: person.email,
      title: person.title,
      firstName: person.firstName,
      lastName: person.lastName,
      role: person.role,
      isActing: person.isActing,
      whatsapp: person.whatsapp,
      schoolId: person.schoolId,
      departmentId: person.departmentId,
      isActive: true,
    };
    const userId = person.existingUserId ?? randomUUID();
    if (person.existingUserId) {
      await tx.user.update({ where: { id: userId }, data });
      // Programme assignments follow the roster: a coordinator keeps exactly
      // the programmes listed; anyone else has none.
      await tx.userProgramme.deleteMany({ where: { userId, programmeId: { notIn: person.programmeIds } } });
      updated += 1;
    } else {
      await tx.user.create({ data: { id: userId, ...data } });
      created += 1;
    }
    for (const programmeId of person.programmeIds) {
      await tx.userProgramme.upsert({
        where: { userId_programmeId: { userId, programmeId } },
        create: { userId, programmeId },
        update: {},
      });
    }
    await tx.activityLog.create({
      data: {
        actorId,
        action: person.existingUserId ? "USER_UPDATED_FROM_ROSTER" : "USER_CREATED_FROM_ROSTER",
        entityType: "USER",
        entityId: userId,
        description: `${person.existingUserId ? "Updated" : "Added"} ${person.firstName} ${person.lastName} (${person.role.toLowerCase().replaceAll("_", " ")}, ${person.unitLabel}) from the roster.`,
        metadata: { sheet: person.sheet, row: person.rowNumber, changes: person.changes },
      },
    });
  }
  return { created, updated };
}
