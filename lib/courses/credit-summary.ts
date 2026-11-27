/**
 * Tasks W3, W4 and W5: the credit arithmetic the app does itself, so nobody
 * types it and the sums always agree with the Course Structure.
 *
 * - W4: each level's credit summary: General Education, Departmental,
 *   Non-departmental (courses from other departments) and Total.
 * - W3: electives in a named group count as the units a student must choose
 *   from the group, not as every course in it.
 * - W5: the graduation numbers (minimum departmental credits, minimum credits
 *   outside the department, overall minimum) are the summary's totals.
 *
 * Browser-safe: no database access.
 */

export type CreditCourse = {
  code?: string;
  level: number;
  units: number;
  status?: string;
  generalEducation: boolean;
  /** Taught by the programme's own department (false: another department's course). */
  owned: boolean;
  electiveGroupId?: string | null;
};

export type CreditGroup = { id: string; name: string; chooseUnits: number };

export type CreditRow = {
  level: number;
  generalEducation: number;
  departmental: number;
  outside: number;
  total: number;
};

export type CreditSummary = {
  rows: CreditRow[];
  totals: Omit<CreditRow, "level">;
};

const zero = () => ({ generalEducation: 0, departmental: 0, outside: 0, total: 0 });

function bucket(course: Pick<CreditCourse, "generalEducation" | "owned">): "generalEducation" | "departmental" | "outside" {
  if (course.generalEducation) return "generalEducation";
  return course.owned ? "departmental" : "outside";
}

/** The credit summary by level (W4), counting each elective group's minimum (W3). */
export function creditSummary(courses: CreditCourse[], groups: CreditGroup[] = []): CreditSummary {
  const byLevel = new Map<number, CreditRow>();
  const row = (level: number) => {
    if (!byLevel.has(level)) byLevel.set(level, { level, ...zero() });
    return byLevel.get(level)!;
  };
  const known = new Map(groups.map((group) => [group.id, group]));

  for (const course of courses) {
    if (course.electiveGroupId && known.has(course.electiveGroupId)) continue;
    const target = row(course.level);
    target[bucket(course)] += course.units || 0;
  }

  // A group counts once, at its lowest level, as the units a student must
  // choose from it (never more than it offers).
  for (const group of groups) {
    const members = courses.filter((course) => course.electiveGroupId === group.id);
    if (members.length === 0) continue;
    const offered = members.reduce((sum, course) => sum + (course.units || 0), 0);
    const chosen = Math.max(0, Math.min(group.chooseUnits || 0, offered));
    const level = Math.min(...members.map((course) => course.level));
    const kind = members.every((course) => course.generalEducation)
      ? "generalEducation"
      : members.some((course) => !course.generalEducation && course.owned)
        ? "departmental"
        : "outside";
    row(level)[kind] += chosen;
  }

  const rows = [...byLevel.values()]
    .map((item) => ({ ...item, total: item.generalEducation + item.departmental + item.outside }))
    .sort((a, b) => a.level - b.level);
  const totals = rows.reduce(
    (sum, item) => ({
      generalEducation: sum.generalEducation + item.generalEducation,
      departmental: sum.departmental + item.departmental,
      outside: sum.outside + item.outside,
      total: sum.total + item.total,
    }),
    zero(),
  );
  return { rows, totals };
}

/** The three graduation numbers the app writes (W5), plus General Education. */
export function graduationNumbers(courses: CreditCourse[], groups: CreditGroup[] = []) {
  const { totals } = creditSummary(courses, groups);
  return totals;
}

/** W5 in words, as the bulletin prints it under Graduation Requirements. */
export function graduationNumbersText(numbers: Omit<CreditRow, "level">): string {
  const parts = [
    `${numbers.departmental} in the department's own courses`,
    `${numbers.outside} in courses from other departments`,
    `${numbers.generalEducation} in General Education`,
  ];
  return `To graduate, a student must earn at least ${numbers.total} credits: ${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}.`;
}

/** W2: the units the contact hours give: lecture hours / 15 + practical hours / 45. */
export function unitsFromHours(lectureHours: number | null | undefined, practicalHours: number | null | undefined): number | null {
  if (lectureHours == null && practicalHours == null) return null;
  return (lectureHours ?? 0) / 15 + (practicalHours ?? 0) / 45;
}

/** W2's gentle hint: "2 units usually means 30 lecture hours". */
export function hoursHint(units: number): string {
  return `${units} unit${units === 1 ? "" : "s"} usually means ${units * 15} lecture hours (or 45 practical hours for each unit).`;
}
