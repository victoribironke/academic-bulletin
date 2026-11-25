/**
 * Task B6: every course Babcock offers has an owner, a department or a
 * school, which writes its description for every programme that uses it
 * (rule W16). General Education courses (GST, BU-GST and ENT) belong to the
 * General Education desk, run by DAP (decision DEC8), and get no department.
 *
 * Owners are filled in, never changed, in this order:
 *   1. the work order's defaults (B6_OWNER_DEFAULTS: PHY and STA to Basic and
 *      Applied Sciences, AMS to the School of Management Sciences, ...);
 *   2. the owner of the other courses with the same prefix, when one owner
 *      has at least three quarters of them ("CHM 327" goes where CHM is),
 *      unless only another department's programmes use the course;
 *   3. the department whose programmes use it, when only one department's do.
 * Anything left is listed for DAP. Planning is pure, so it can be checked in
 * tests and shown as a dry run before anything is written.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { isGeneralEducationFamily } from "@/lib/courses/general-education";
import { B6_OWNER_DEFAULTS } from "@/lib/imports/owner-defaults";
import { recordActivity } from "@/lib/activity-log";

type Database = PrismaClient | Prisma.TransactionClient;

/** B5: a course Babcock offers is linked to a Babcock programme or has a BU- code. */
export const OFFERED_COURSE: Prisma.MasterCourseWhereInput = {
  OR: [{ programmeLinks: { some: {} } }, { code: { startsWith: "BU-" } }],
};

export type OwnerUnit = { kind: "DEPARTMENT" | "SCHOOL"; id: string; code: string; name: string };
export type OwnerRule = "WORK_ORDER" | "SAME_PREFIX" | "PROGRAMMES";

export type OwnerPlanCourse = {
  id: string;
  code: string;
  title: string;
  ownerDeptId: string | null;
  ownerSchoolId: string | null;
  /** The departments of the programmes linked to the course. */
  programmeDepartmentIds: string[];
};

export type OwnerChange = { courseId: string; code: string; title: string; owner: OwnerUnit; rule: OwnerRule; why: string };
export type OwnerGap = { courseId: string; code: string; title: string; why: string };

export type OwnerPlan = {
  changes: OwnerChange[];
  gaps: OwnerGap[];
  counts: { offered: number; generalEducation: number; owned: number; toFill: number; gaps: number };
};

/** "BU-ANS 101", "ANS 101" and "ANS101" share the prefix ANS. */
export function coursePrefix(code: string): string {
  return code.trim().toUpperCase().replace(/^BU-?\s*/, "").match(/^[A-Z]+/)?.[0] ?? "";
}

export function planCourseOwners(input: {
  courses: OwnerPlanCourse[];
  departments: { id: string; code: string; name: string }[];
  schools: { id: string; code: string; name: string }[];
}): OwnerPlan {
  const department = new Map(input.departments.map((unit) => [unit.id, unit]));
  const departmentByCode = new Map(input.departments.map((unit) => [unit.code, unit]));
  const school = new Map(input.schools.map((unit) => [unit.id, unit]));
  const schoolByCode = new Map(input.schools.map((unit) => [unit.code, unit]));
  const unit = (key: string): OwnerUnit | null => {
    const [kind, id] = key.split(":");
    const found = kind === "dept" ? department.get(id) : school.get(id);
    return found ? { kind: kind === "dept" ? "DEPARTMENT" : "SCHOOL", id: found.id, code: found.code, name: found.name } : null;
  };
  const keyOf = (course: { ownerDeptId: string | null; ownerSchoolId: string | null }) =>
    course.ownerDeptId ? `dept:${course.ownerDeptId}` : course.ownerSchoolId ? `school:${course.ownerSchoolId}` : null;

  const generalEducation = input.courses.filter((course) => isGeneralEducationFamily(course.code));
  const departmental = input.courses.filter((course) => !isGeneralEducationFamily(course.code));
  const owners = new Map<string, string>(); // course id -> owner key, as the plan goes
  for (const course of departmental) {
    const key = keyOf(course);
    if (key) owners.set(course.id, key);
  }
  const changes: OwnerChange[] = [];
  const gaps: OwnerGap[] = [];
  const unowned = departmental.filter((course) => !owners.has(course.id));

  // 1. The work order's defaults.
  const afterDefaults: OwnerPlanCourse[] = [];
  for (const course of unowned) {
    const rule = B6_OWNER_DEFAULTS.find((entry) => entry.match.test(course.code.toUpperCase()));
    const target = rule?.school ? schoolByCode.get(rule.school) : rule?.department ? departmentByCode.get(rule.department) : undefined;
    if (rule && target) {
      const key = `${rule.school ? "school" : "dept"}:${target.id}`;
      owners.set(course.id, key);
      changes.push({ courseId: course.id, code: course.code, title: course.title, owner: unit(key)!, rule: "WORK_ORDER", why: "The work order's default (B6); DAP can change it." });
    } else {
      afterDefaults.push(course);
    }
  }

  // 2. The owner of the other courses with the same prefix.
  const byPrefix = new Map<string, Map<string, number>>();
  for (const course of departmental) {
    const key = owners.get(course.id);
    if (!key) continue;
    const votes = byPrefix.get(coursePrefix(course.code)) ?? new Map<string, number>();
    votes.set(key, (votes.get(key) ?? 0) + 1);
    byPrefix.set(coursePrefix(course.code), votes);
  }
  const afterPrefix: OwnerPlanCourse[] = [];
  for (const course of afterDefaults) {
    const votes = [...(byPrefix.get(coursePrefix(course.code))?.entries() ?? [])].sort((a, b) => b[1] - a[1]);
    const total = votes.reduce((sum, [, count]) => sum + count, 0);
    const [top] = votes;
    const owner = top ? unit(top[0]) : null;
    const users = [...new Set(course.programmeDepartmentIds)];
    // The prefix and the programmes disagree: one department's programmes use
    // it but another owns the prefix (MCM is Mass Communication, but MCM 221
    // Drug Design serves Basic Sciences). DAP decides.
    if (top && owner && top[1] >= 2 && top[1] / total >= 0.75 && users.length === 1 && owner.id !== users[0]) {
      const user = department.get(users[0]);
      gaps.push({
        courseId: course.id,
        code: course.code,
        title: course.title,
        why: `${owner.name} owns the other ${coursePrefix(course.code)} courses, but only ${user?.name ?? "another department"}'s programmes use it.`,
      });
    } else if (top && owner && top[1] >= 2 && top[1] / total >= 0.75) {
      changes.push({
        courseId: course.id,
        code: course.code,
        title: course.title,
        owner,
        rule: "SAME_PREFIX",
        why: `${owner.name} owns ${top[1]} of the ${total} other ${coursePrefix(course.code)} courses.`,
      });
    } else {
      afterPrefix.push(course);
    }
  }

  // 3. The one department whose programmes use it.
  for (const course of afterPrefix) {
    const users = [...new Set(course.programmeDepartmentIds)];
    const owner = users.length === 1 ? unit(`dept:${users[0]}`) : null;
    if (owner) {
      changes.push({ courseId: course.id, code: course.code, title: course.title, owner, rule: "PROGRAMMES", why: `Only ${owner.name}'s programmes use it.` });
    } else {
      gaps.push({
        courseId: course.id,
        code: course.code,
        title: course.title,
        why:
          users.length === 0
            ? "No programme uses it and no rule names an owner."
            : `Programmes in ${users.length} departments use it (${users.map((id) => department.get(id)?.code ?? id).sort().join(", ")}).`,
      });
    }
  }

  changes.sort((a, b) => a.code.localeCompare(b.code));
  gaps.sort((a, b) => a.code.localeCompare(b.code));
  return {
    changes,
    gaps,
    counts: {
      offered: input.courses.length,
      generalEducation: generalEducation.length,
      owned: departmental.length - unowned.length,
      toFill: changes.length,
      gaps: gaps.length,
    },
  };
}

export async function planCourseOwnersFromDatabase(db: Database): Promise<OwnerPlan> {
  const [courses, departments, schools] = await Promise.all([
    db.masterCourse.findMany({
      where: OFFERED_COURSE,
      select: {
        id: true,
        code: true,
        title: true,
        ownerDeptId: true,
        ownerSchoolId: true,
        programmeLinks: { select: { programme: { select: { departmentId: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    db.department.findMany({ select: { id: true, code: true, name: true } }),
    db.school.findMany({ select: { id: true, code: true, name: true } }),
  ]);
  return planCourseOwners({
    courses: courses.map(({ programmeLinks, ...course }) => ({
      ...course,
      programmeDepartmentIds: programmeLinks.map((link) => link.programme.departmentId),
    })),
    departments,
    schools,
  });
}

/** Sets the planned owners. Only a course that still has no owner is changed. */
export async function applyCourseOwners(db: PrismaClient, plan: OwnerPlan, options: { actorId: string }) {
  let filled = 0;
  await db.$transaction(
    async (tx) => {
      for (const change of plan.changes) {
        const result = await tx.masterCourse.updateMany({
          where: { id: change.courseId, ownerDeptId: null, ownerSchoolId: null },
          data:
            change.owner.kind === "DEPARTMENT"
              ? { ownership: "DEPARTMENT", ownerDeptId: change.owner.id }
              : { ownership: "SCHOOL", ownerSchoolId: change.owner.id },
        });
        filled += result.count;
      }
      await recordActivity(
        {
          actorId: options.actorId,
          action: "COURSE_OWNERS_FILLED",
          entityType: "MASTER_COURSE",
          entityId: "registry",
          description: `Gave ${filled} Registry courses an owner (B6); ${plan.gaps.length} are left for DAP.`,
          metadata: {
            byRule: Object.fromEntries(
              (["WORK_ORDER", "SAME_PREFIX", "PROGRAMMES"] as const).map((rule) => [rule, plan.changes.filter((change) => change.rule === rule).length]),
            ),
            gaps: plan.gaps.map((gap) => gap.code),
          },
        },
        tx,
      );
    },
    { timeout: 120_000 },
  );
  return { filled };
}

const RULE_LABEL: Record<OwnerRule, string> = {
  WORK_ORDER: "work order default",
  SAME_PREFIX: "same prefix",
  PROGRAMMES: "only user",
};

export function courseOwnersReport(plan: OwnerPlan, heading: string): string {
  const lines = [
    `# ${heading}`,
    "",
    `- Courses Babcock offers: ${plan.counts.offered}`,
    `- General Education (GST, BU-GST, ENT), owned by the General Education desk (DEC8): ${plan.counts.generalEducation}`,
    `- Already have an owner: ${plan.counts.owned}`,
    `- Owners to fill in: ${plan.counts.toFill}`,
    `- Left for DAP: ${plan.counts.gaps}`,
    "",
    "An owner is only ever filled in, never changed. DAP can change any owner in Master Courses.",
  ];
  if (plan.changes.length) {
    lines.push("", "## Owners to fill in", "", "| Course | Owner | Rule | Why |", "| --- | --- | --- | --- |");
    for (const change of plan.changes) {
      lines.push(`| ${change.code} ${change.title} | ${change.owner.code} ${change.owner.name} | ${RULE_LABEL[change.rule]} | ${change.why} |`);
    }
  }
  if (plan.gaps.length) {
    lines.push("", `## Left for DAP (${plan.gaps.length})`, "", "| Course | Why no owner |", "| --- | --- |");
    for (const gap of plan.gaps) lines.push(`| ${gap.code} ${gap.title} | ${gap.why} |`);
  }
  return lines.join("\n");
}
