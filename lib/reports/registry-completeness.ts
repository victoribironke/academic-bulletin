/**
 * The Registry completeness report (work order task B8), for DAP: for each
 * programme, its Registry courses per level and semester, credits per
 * semester against the 16 to 24 range, total credits against the figure the
 * draft states for graduation, and the courses missing a description,
 * learning outcomes or an owner, or that look duplicated.
 *
 * Built from the Registry's programme links (with each programme's own
 * units and semester where it has them). The builder is pure; loading is one
 * query, so all 66 programmes take well under 5 seconds.
 */
import prisma from "@/lib/prisma";
import { COURSE_CODE_PATTERN } from "@/lib/validation/name-format";

/** Academic Policy, Academic Load: 16 to 24 credits a semester. */
export const SEMESTER_CREDIT_RANGE = { min: 16, max: 24 } as const;

export type ReportLink = {
  programme: { id: string; code: string; name: string; isNew: boolean };
  course: {
    code: string;
    title: string;
    units: number;
    level: number;
    semester: number | null;
    ownership: string;
    ownerDeptId: string | null;
    ownerSchoolId: string | null;
    courseContent: string | null;
    description: string | null;
    learningOutcomes: unknown;
  };
  unitsOverride: number | null;
  semesterOverride: number | null;
  levelOverride?: number | null;
};

export type ProgrammeSummary = {
  code: string;
  name: string;
  isNew: boolean;
  courses: number;
  totalCredits: number;
  statedTotal: number | null;
  semestersOutOfRange: number;
  missingDescription: number;
  missingOutcomes: number;
  noOwner: number;
  duplicates: number;
};

export type SemesterRow = {
  programmeCode: string;
  programmeName: string;
  level: number;
  semester: string;
  courses: number;
  credits: number;
  withinRange: boolean | null;
};

export type IssueRow = { programmeCode: string; programmeName: string; code: string; title: string; issue: string };

export type CompletenessReport = {
  generatedAt: string;
  programmes: ProgrammeSummary[];
  semesters: SemesterRow[];
  issues: IssueRow[];
};

const titleKey = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();
const hasText = (value: string | null | undefined) => Boolean(value && value.trim());
const hasOutcomes = (value: unknown) =>
  Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim() !== "");

export function buildCompletenessReport(input: {
  programmes: { id: string; code: string; name: string; isNew: boolean }[];
  links: ReportLink[];
  statedTotals: Map<string, number | null>;
  now?: Date;
}): CompletenessReport {
  const programmes: ProgrammeSummary[] = [];
  const semesters: SemesterRow[] = [];
  const issues: IssueRow[] = [];

  for (const programme of input.programmes) {
    const links = input.links.filter((link) => link.programme.id === programme.id);
    const issue = (code: string, title: string, text: string) =>
      issues.push({ programmeCode: programme.code, programmeName: programme.name, code, title, issue: text });

    // Courses and credits per level and semester.
    const groups = new Map<string, { level: number; semester: string; courses: number; credits: number }>();
    for (const link of links) {
      const semester = link.semesterOverride ?? link.course.semester;
      const level = link.levelOverride ?? link.course.level;
      const key = `${level}:${semester ?? "S"}`;
      const group = groups.get(key) ?? {
        level,
        semester: semester === 1 || semester === 2 ? String(semester) : "Sessional",
        courses: 0,
        credits: 0,
      };
      group.courses += 1;
      group.credits += link.unitsOverride ?? link.course.units;
      groups.set(key, group);
    }
    const rows = [...groups.values()].sort((a, b) => a.level - b.level || a.semester.localeCompare(b.semester));
    let outOfRange = 0;
    for (const group of rows) {
      const withinRange =
        group.semester === "Sessional"
          ? null
          : group.credits >= SEMESTER_CREDIT_RANGE.min && group.credits <= SEMESTER_CREDIT_RANGE.max;
      if (withinRange === false) outOfRange += 1;
      semesters.push({ programmeCode: programme.code, programmeName: programme.name, ...group, withinRange });
    }

    // Course by course.
    let missingDescription = 0;
    let missingOutcomes = 0;
    let noOwner = 0;
    let duplicates = 0;
    const byTitle = new Map<string, string>();
    for (const link of [...links].sort((a, b) => a.course.code.localeCompare(b.course.code))) {
      const { code, title } = link.course;
      if (!hasText(link.course.courseContent) && !hasText(link.course.description)) {
        missingDescription += 1;
        issue(code, title, "No description");
      }
      if (!hasOutcomes(link.course.learningOutcomes)) {
        missingOutcomes += 1;
        issue(code, title, "No learning outcomes");
      }
      if (link.course.ownership !== "INSTITUTIONAL" && !link.course.ownerDeptId && !link.course.ownerSchoolId) {
        noOwner += 1;
        issue(code, title, "No owner department or school");
      }
      const sameTitle = byTitle.get(titleKey(title));
      if (sameTitle) {
        duplicates += 1;
        issue(code, title, `Same title as ${sameTitle}`);
      } else {
        byTitle.set(titleKey(title), code);
      }
      if (!COURSE_CODE_PATTERN.test(code)) {
        duplicates += 1;
        issue(code, title, 'Code not in the standard format ("ABC 123"); may duplicate another code (B3)');
      }
    }

    programmes.push({
      code: programme.code,
      name: programme.name,
      isNew: programme.isNew,
      courses: links.length,
      totalCredits: links.reduce((total, link) => total + (link.unitsOverride ?? link.course.units), 0),
      statedTotal: input.statedTotals.get(programme.id) ?? null,
      semestersOutOfRange: outOfRange,
      missingDescription,
      missingOutcomes,
      noOwner,
      duplicates,
    });
  }

  return { generatedAt: (input.now ?? new Date()).toISOString(), programmes, semesters, issues };
}

/** Loads the Registry and the current drafts' stated totals, then builds the report. */
export async function loadCompletenessReport(): Promise<CompletenessReport> {
  const [programmes, links, cycle] = await Promise.all([
    prisma.programme.findMany({
      where: { isHidden: false },
      select: { id: true, code: true, name: true, isNew: true },
      orderBy: { code: "asc" },
    }),
    prisma.programmeCourse.findMany({
      where: { programme: { isHidden: false }, course: { discoverable: true } },
      select: {
        unitsOverride: true,
        semesterOverride: true,
        levelOverride: true,
        programme: { select: { id: true, code: true, name: true, isNew: true } },
        course: {
          select: {
            code: true,
            title: true,
            units: true,
            level: true,
            semester: true,
            ownership: true,
            ownerDeptId: true,
            ownerSchoolId: true,
            courseContent: true,
            description: true,
            learningOutcomes: true,
          },
        },
      },
    }),
    prisma.reviewCycle.findFirst({
      where: { isActive: true, archivedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    }),
  ]);
  const drafts = cycle
    ? await prisma.submission.findMany({
        where: { cycleId: cycle.id },
        select: { programmeId: true, content: { select: { totalUnits: true } } },
      })
    : [];
  const statedTotals = new Map(drafts.map((draft) => [draft.programmeId, draft.content?.totalUnits ?? null]));
  return buildCompletenessReport({ programmes, links, statedTotals });
}
