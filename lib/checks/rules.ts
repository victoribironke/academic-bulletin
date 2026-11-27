/**
 * Task F1 (rules engine, R2): the checks of the work order's Appendix A, as
 * pure functions over one draft. Each finding has its check number, a level
 * (Must fix, Please check, Fixed for you), the section and field it is about,
 * a plain message and a key: a "Please check" the Head accepts with a reason
 * stays accepted until something new of the same kind turns up.
 *
 * The limits come from config/academic-policy.json (task F6), not from code.
 */
import policy from "@/config/academic-policy.json";
import { generalEducationBlockFor, isGeneralEducationFamily, programmeLevels } from "@/lib/courses/general-education";
import { admissionWordingProblems } from "@/lib/bulletin/admission-wording";
import { carriedIssues } from "@/lib/bulletin/carried-fields";
import { type CreditGroup, creditSummary, unitsFromHours } from "@/lib/courses/credit-summary";

export type CheckLevel = "MUST" | "CHECK" | "FIXED";

export type SectionKey =
  | "deans_hods"
  | "staff"
  | "overview"
  | "admission"
  | "graduation"
  | "courses"
  | "descriptions"
  | "regulations";

export type Finding = {
  /** Appendix A's number (V1 to V26), or "Required" for content every bulletin needs. */
  rule: string;
  level: CheckLevel;
  section: SectionKey;
  field?: string;
  /** Identifies this finding for an accepted "Please check". */
  key: string;
  message: string;
  items?: string[];
};

export const POLICY = policy;

export type DraftCourse = {
  code: string;
  title: string;
  units: number;
  level: number;
  semester: number | null;
  status: string;
  inRegistry: boolean;
  generalEducation: boolean;
  owned: boolean;
  description: { learningOutcomes: string[]; courseContent: string } | null;
  /** W2: contact hours a semester, when the Head has entered them. */
  lectureHours?: number | null;
  practicalHours?: number | null;
  /** W3: the elective group the course belongs to. */
  electiveGroupId?: string | null;
};

export type DraftData = {
  submissionId: string;
  phase: number;
  programme: { code: string; name: string; duration: number | null; isNew: boolean };
  content: Record<string, unknown> | null;
  courses: DraftCourse[];
  staff: { type: string; academicRank: string; highestQualification: string | null; customJobTitle: string | null; name?: string }[];
  openComments: { section: string | null }[];
  courseListConfirmed: boolean;
  graceBlocked: string[];
  approvedLoadExceptions?: { level: number; semester: number }[];
  /** W3: the draft's named elective groups. */
  electiveGroups?: CreditGroup[];
};

const text = (value: unknown) => (typeof value === "string" ? value.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() : "");
const words = (value: unknown) => text(value).split(" ").filter(Boolean);
const list = (items: string[], max = 8) => (items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} and ${items.length - max} more`);
const levelName = (level: number) => `${level} level`;
const semesterName = (semester: number) => (semester === 1 ? "first semester" : "second semester");
const unitsWord = (count: number) => `${count} unit${count === 1 ? "" : "s"}`;

/** Industrial training, internships and clinical postings: a placement semester (W8). */
export const PLACEMENT = /\b(siwes|industrial (training|attachment|work experience)|internship|practicum|clerkship|teaching practice|work experience)\b/i;

function levelsOf(data: DraftData): number[] {
  return programmeLevels(data.programme.duration, data.courses.map((course) => course.level));
}

function similarity(a: string, b: string): number {
  const left = new Set(words(a).map((word) => word.toLowerCase()));
  const right = new Set(words(b).map((word) => word.toLowerCase()));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

/** W4/W5: the numbers the app builds from the Course Structure, counting each elective group's minimum (W3). */
export function creditNumbers(courses: DraftCourse[], groups: CreditGroup[] = []) {
  return creditSummary(courses, groups).totals;
}

export function runRules(data: DraftData): Finding[] {
  const findings: Finding[] = [];
  const add = (finding: Finding) => findings.push(finding);
  const content = data.content ?? {};
  const courses = data.courses;
  const levels = levelsOf(data);
  const finalLevel = (data.programme.duration ?? 4) * 100;
  const groups = data.electiveGroups ?? [];
  const numbers = creditNumbers(courses, groups);
  const sessional = courses.length > 0 && courses.filter((course) => !course.generalEducation).every((course) => course.semester === null);

  // V1: the stated total agrees with the Course Structure.
  const statedTotal = typeof content.totalUnits === "number" ? content.totalUnits : null;
  if (statedTotal !== null && statedTotal !== numbers.total) {
    add({
      rule: "V1",
      level: "MUST",
      section: "graduation",
      field: "totalUnits",
      key: "V1",
      message: `The Course Structure adds up to ${unitsWord(numbers.total)}, but the programme's total says ${statedTotal}.`,
    });
  }

  // V2: every level of the programme's length has courses, in both semesters.
  for (const level of levels.filter((item) => item <= finalLevel)) {
    const atLevel = courses.filter((course) => course.level === level && !course.generalEducation);
    if (atLevel.length === 0) {
      add({ rule: "V2", level: "MUST", section: "courses", key: `V2:${level}`, message: `${levelName(level)} has no courses of the programme's own.` });
      continue;
    }
    if (sessional) continue;
    for (const semester of [1, 2]) {
      if (!atLevel.some((course) => course.semester === semester || course.semester === null)) {
        add({ rule: "V2", level: "MUST", section: "courses", key: `V2:${level}:${semester}`, message: `${levelName(level)} has no ${semesterName(semester)} courses.` });
      }
    }
  }

  // V3: 16 to 24 credits a regular semester (placement semesters and DAP's approved exceptions aside).
  if (!sessional) {
    for (const level of levels) {
      for (const semester of [1, 2]) {
        const rows = courses.filter((course) => course.level === level && course.semester === semester);
        if (rows.length === 0 || rows.some((course) => PLACEMENT.test(course.title))) continue;
        // W3: a group's courses count as the units a student chooses from it;
        // a group spread over other semesters can't be placed, so skip.
        const groupsHere = groups.filter((group) => rows.some((course) => course.electiveGroupId === group.id));
        const spread = groupsHere.some((group) =>
          courses.some((course) => course.electiveGroupId === group.id && (course.level !== level || course.semester !== semester)),
        );
        if (spread) continue;
        const total =
          rows.filter((course) => !groupsHere.some((group) => group.id === course.electiveGroupId)).reduce((sum, course) => sum + course.units, 0) +
          groupsHere.reduce((sum, group) => sum + group.chooseUnits, 0);
        const { min, max } = POLICY.semesterCredits;
        if (total >= min && total <= max) continue;
        if (data.approvedLoadExceptions?.some((item) => item.level === level && item.semester === semester)) continue;
        add({
          rule: "V3",
          level: "CHECK",
          section: "courses",
          key: `V3:${level}:${semester}:${total}`,
          message: `${levelName(level)}, ${semesterName(semester)} carries ${unitsWord(total)}; the Academic Policy expects ${min} to ${max} unless Senate has approved otherwise.`,
        });
      }
    }
  }

  // V4: graduation requirements that state a total must agree with the structure.
  const graduation = text(content.graduationRequirements);
  if (graduation && numbers.total > 0) {
    const stated = [...graduation.matchAll(/(\d{2,3})\s*(?:credit|unit)/gi)].map((match) => Number(match[1])).filter((value) => value >= 60);
    if (stated.length > 0 && !stated.includes(numbers.total)) {
      add({
        rule: "V4",
        level: "MUST",
        section: "graduation",
        field: "graduationRequirements",
        key: `V4:${numbers.total}`,
        message: `The graduation requirements state ${list(stated.map((value) => `${value} units`))}, but the Course Structure adds up to ${unitsWord(numbers.total)}.`,
      });
    }
  }

  // V5: the General Education block is complete for every level.
  const codes = new Set(courses.map((course) => course.code));
  const missingBlock = generalEducationBlockFor(levels).filter((course) => !codes.has(course.code)).map((course) => course.code);
  if (missingBlock.length) {
    add({ rule: "V5", level: "MUST", section: "courses", key: "V5", message: `The General Education block is missing ${list(missingBlock)}. Ask DAP to add them.`, items: missingBlock });
  }

  // V6: the Dean's and the Head's photos.
  const info = (content.programmeInfo ?? {}) as { deanImageUrl?: string; hodImageUrl?: string };
  const photos = [!info.deanImageUrl && "the Dean's photo", !info.hodImageUrl && "the Head of Department's photo"].filter(Boolean) as string[];
  if (photos.length) {
    add({ rule: "V6", level: "MUST", section: "deans_hods", key: "V6", message: `Add ${photos.join(" and ")}.` });
  }

  // V7: Direct Entry and Transfer wording isn't the UTME wording (W13).
  for (const problem of admissionWordingProblems({
    utmeRequirements: text(content.utmeRequirements),
    directEntryRequirements: text(content.directEntryRequirements),
    transferRequirements: text(content.transferRequirements),
  })) {
    add({ rule: "V7", level: "CHECK", section: "admission", key: `V7:${problem.slice(0, 40)}`, message: problem });
  }

  // V8: no two course descriptions are nearly the same.
  const described = courses.filter((course) => !course.generalEducation && words(course.description?.courseContent).length >= 20);
  for (let i = 0; i < described.length; i += 1) {
    for (let j = i + 1; j < described.length; j += 1) {
      if (similarity(described[i].description!.courseContent, described[j].description!.courseContent) >= 0.9) {
        add({
          rule: "V8",
          level: "CHECK",
          section: "descriptions",
          key: `V8:${described[i].code}:${described[j].code}`,
          message: `${described[i].code} and ${described[j].code} have nearly the same course content.`,
        });
      }
    }
  }

  // V10: Mission and Vision aren't copies of each other or of the Philosophy.
  const statements: [string, unknown][] = [["Mission", content.mission], ["Vision", content.vision], ["Philosophy", content.philosophy]];
  for (let i = 0; i < statements.length; i += 1) {
    for (let j = i + 1; j < statements.length; j += 1) {
      if (words(statements[i][1]).length >= 8 && words(statements[j][1]).length >= 8 && similarity(text(statements[i][1]), text(statements[j][1])) >= 0.8) {
        add({ rule: "V10", level: "CHECK", section: "overview", key: `V10:${statements[i][0]}:${statements[j][0]}`, message: `The ${statements[i][0]} and the ${statements[j][0]} are nearly the same; each should say something of its own.` });
      }
    }
  }

  // V11: at least three learning outcomes per course the programme writes.
  const fewOutcomes = courses
    .filter((course) => !course.generalEducation && course.description && course.description.learningOutcomes.length > 0 && course.description.learningOutcomes.length < POLICY.learningOutcomesMin)
    .map((course) => course.code);
  if (fewOutcomes.length) {
    add({
      rule: "V11",
      level: "CHECK",
      section: "descriptions",
      key: `V11:${fewOutcomes.join(",")}`,
      message: `Give at least ${POLICY.learningOutcomesMin} learning outcomes, one per line, each starting with an action word, for ${list(fewOutcomes)}.`,
      items: fewOutcomes,
    });
  }

  // V12: every course the department owns passes GRACE (DEC11).
  if (data.graceBlocked.length) {
    add({ rule: "V12", level: "MUST", section: "descriptions", key: "V12", message: `These courses haven't passed GRACE yet: ${list(data.graceBlocked)}.`, items: data.graceBlocked });
  }

  // V13: no open comments.
  const bySection = new Map<string, number>();
  for (const comment of data.openComments) bySection.set(comment.section ?? "overview", (bySection.get(comment.section ?? "overview") ?? 0) + 1);
  for (const [section, count] of bySection) {
    add({
      rule: "V13",
      level: "MUST",
      section: (section as SectionKey) ?? "overview",
      key: `V13:${section}`,
      message: `${count} open comment${count === 1 ? "" : "s"} to answer and resolve.`,
    });
  }

  // V14: Summary of Changes (or About this new programme), at least 50 words.
  const summaryWords = words((content.sectionG as { content?: string } | null)?.content).length;
  if (summaryWords < POLICY.summaryOfChangesMinWords) {
    add({
      rule: "V14",
      level: "CHECK",
      section: "regulations",
      field: "summaryOfChanges",
      key: "V14",
      message: data.programme.isNew
        ? `Say about this new programme in at least ${POLICY.summaryOfChangesMinWords} words: the NUC approval, the first intake, why Babcock offers it and who will teach it.`
        : `Write the Summary of Changes in at least ${POLICY.summaryOfChangesMinWords} words (${summaryWords} so far).`,
    });
  }

  // V16: every course is in the Course Registry under its code.
  const notInRegistry = courses.filter((course) => !course.inRegistry).map((course) => course.code);
  if (notInRegistry.length) {
    add({
      rule: "V16",
      level: "MUST",
      section: "courses",
      key: "V16",
      message: `These courses aren't in the Course Registry yet: ${list(notInRegistry)}. Ask DAP to add them, or correct the code.`,
      items: notInRegistry,
    });
  }

  // V17: the Head has confirmed the course list.
  if (courses.length > 0 && !data.courseListConfirmed) {
    add({ rule: "V17", level: "MUST", section: "courses", key: "V17", message: "Confirm the course list at the top of Course Structure, or ask DAP for a change." });
  }

  // V18: text carried over from 2023-2027 is reviewed.
  for (const issue of carriedIssues((content.carriedFields as string[] | undefined) ?? [])) {
    const section = issue.code.replace("CARRIED_", "").toLowerCase() as SectionKey;
    add({ rule: "V18", level: "MUST", section, key: `V18:${section}`, message: issue.message });
  }

  // V19: at least one academic staff member with rank and highest qualification.
  const academic = data.staff.filter((member) => member.type === "ACADEMIC" && member.academicRank && member.academicRank !== "OTHER" && member.highestQualification);
  if (academic.length === 0) {
    add({ rule: "V19", level: "MUST", section: "staff", key: "V19", message: "List at least one academic staff member with their rank and highest qualification." });
  }
  const untitled = data.staff.filter((member) => member.academicRank === "OTHER" && !text(member.customJobTitle));
  if (untitled.length > 0) {
    const named = untitled.map((member) => member.name).filter(Boolean) as string[];
    add({
      rule: "V19",
      level: "MUST",
      section: "staff",
      key: "V19:title",
      message:
        named.length === untitled.length
          ? `Give a job title to ${list(named)}, listed with rank Other.`
          : `Give a job title to the ${untitled.length} staff member${untitled.length === 1 ? "" : "s"} listed with rank Other.`,
      items: named,
    });
  }

  // V21: the programme's levels match its length (W12).
  const beyond = [...new Set(courses.filter((course) => course.level > finalLevel).map((course) => course.level))].sort();
  if (beyond.length) {
    add({
      rule: "V21",
      level: "MUST",
      section: "courses",
      key: `V21:${beyond.join(",")}`,
      message: `The programme runs ${data.programme.duration ?? 4} years, but has courses at ${list(beyond.map(levelName))}. Move them, or ask DAP to correct the programme's length.`,
    });
  }

  // V22: a course's level and semester match its number (W10).
  const mismatched = courses
    .filter((course) => !course.generalEducation)
    .filter((course) => {
      const match = course.code.match(/(\d)(\d)(\d)$/);
      if (!match) return false;
      if (Number(match[1]) * 100 !== course.level) return true;
      const last = Number(match[3]);
      if (last === 0 || course.semester === null) return false;
      return (last % 2 === 1 ? 1 : 2) !== course.semester;
    })
    .map((course) => course.code);
  if (mismatched.length) {
    add({
      rule: "V22",
      level: "CHECK",
      section: "courses",
      key: `V22:${mismatched.join(",")}`,
      message: `The number of ${list(mismatched)} doesn't match its level or semester (the first digit is the level; odd numbers usually run in the first semester, even in the second).`,
      items: mismatched,
    });
  }

  // V23: units match the contact hours (W2); projects and placements are exempt.
  const offHours = courses
    .filter((course) => !course.generalEducation && (course.lectureHours != null || course.practicalHours != null))
    .filter((course) => !PLACEMENT.test(course.title) && !/project|dissertation|thesis|research essay/i.test(course.title))
    .filter((course) => {
      const fromHours = unitsFromHours(course.lectureHours, course.practicalHours);
      return fromHours !== null && Math.abs(fromHours - course.units) > 0.01;
    });
  if (offHours.length) {
    const describe = (course: DraftCourse) => {
      const fromHours = Math.round((unitsFromHours(course.lectureHours, course.practicalHours) ?? 0) * 100) / 100;
      return `${course.code} (${unitsWord(course.units)}; ${course.lectureHours ?? 0} lecture and ${course.practicalHours ?? 0} practical hours give ${fromHours})`;
    };
    add({
      rule: "V23",
      level: "CHECK",
      section: "courses",
      key: `V23:${offHours.map((course) => `${course.code}=${course.units}/${course.lectureHours ?? 0}/${course.practicalHours ?? 0}`).join(",")}`,
      message: `Units don't match the contact hours (a unit is 15 lecture hours or 45 practical hours) for ${list(offHours.map(describe), 4)}.`,
      items: offHours.map((course) => course.code),
    });
  }

  // V25: each elective group says how many units a student chooses, and offers at least that many (W3).
  for (const group of groups) {
    const members = courses.filter((course) => course.electiveGroupId === group.id);
    const offered = members.reduce((sum, course) => sum + course.units, 0);
    if (members.length === 0) {
      add({ rule: "V25", level: "MUST", section: "courses", key: `V25:${group.id}:empty`, message: `The elective group "${group.name}" has no courses. Add its courses, or remove the group.` });
    } else if (!(group.chooseUnits > 0)) {
      add({ rule: "V25", level: "MUST", section: "courses", key: `V25:${group.id}:choose`, message: `Say how many units a student chooses from the elective group "${group.name}".` });
    } else if (offered < group.chooseUnits) {
      add({
        rule: "V25",
        level: "MUST",
        section: "courses",
        key: `V25:${group.id}:short`,
        message: `The elective group "${group.name}" asks students to choose ${unitsWord(group.chooseUnits)} but offers only ${unitsWord(offered)}.`,
      });
    }
  }
  const ungrouped = courses.filter((course) => course.status === "ELECTIVE" && !course.generalEducation && !groups.some((group) => group.id === course.electiveGroupId));
  if (ungrouped.length) {
    add({
      rule: "V25",
      level: "CHECK",
      section: "courses",
      key: `V25:ungrouped:${ungrouped.map((course) => course.code).join(",")}`,
      message: `Put ${list(ungrouped.map((course) => course.code))} in an elective group that says how many units a student chooses; until then every elective counts in the totals.`,
      items: ungrouped.map((course) => course.code),
    });
  }

  // V24: the final level has a research project (W7).
  const finalCourses = courses.filter((course) => course.level === finalLevel && !course.generalEducation);
  if (finalCourses.length > 0 && !finalCourses.some((course) => /project|dissertation|thesis|research essay/i.test(course.title) || /\d9\d$/.test(course.code))) {
    add({ rule: "V24", level: "CHECK", section: "courses", key: "V24", message: `${levelName(finalLevel)} has no research project course; most programmes end with one (usually 6 units, numbered ...90).` });
  }

  // V26: minimum CGPA between 2.00 and 5.00; above 2.00, the Head confirms it's a programme rule (W6).
  const cgpa = typeof content.minimumCGPA === "number" ? content.minimumCGPA : null;
  if (cgpa === null) {
    add({ rule: "V26", level: "MUST", section: "graduation", field: "minimumCGPA", key: "V26", message: "Enter the minimum CGPA to graduate." });
  } else if (cgpa < POLICY.cgpa.min || cgpa > POLICY.cgpa.max) {
    add({ rule: "V26", level: "MUST", section: "graduation", field: "minimumCGPA", key: "V26", message: `The minimum CGPA must be between ${POLICY.cgpa.min.toFixed(2)} and ${POLICY.cgpa.max.toFixed(2)}.` });
  } else if (cgpa > POLICY.cgpa.min) {
    add({
      rule: "V26",
      level: "CHECK",
      section: "graduation",
      field: "minimumCGPA",
      key: `V26:${cgpa}`,
      message: `The minimum CGPA is ${cgpa.toFixed(2)}, above the university's ${POLICY.cgpa.min.toFixed(2)}. Confirm it is this programme's own rule.`,
    });
  }

  return findings;
}

/** The General Education family, for callers that build DraftCourse rows. */
export { isGeneralEducationFamily };
