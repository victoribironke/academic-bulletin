import {
  formatCourseCode,
  cleanCourseTitle,
  isValidCourseCode,
} from "@/lib/validation/name-format";
import {
  getImportValue,
  importBoolean,
  importText,
  type SpreadsheetRecord,
  type TemplateColumn,
  type ValidatedImportRow,
} from "@/lib/imports/spreadsheet";
import {
  MAX_COURSE_UNITS,
  MIN_COURSE_UNITS,
  SEMESTER_RULE_MESSAGE,
  UNITS_RULE_MESSAGE,
  isValidCourseUnits,
  parseCourseSemester,
} from "@/lib/courses/course-rules";

export interface CourseImportData {
  code: string;
  title: string;
  units: number;
  status: "CORE" | "ELECTIVE";
  /** 1, 2, or null for a sessional course with no semester (B13). */
  semester: number | null;
  level: number;
  prerequisites: string;
  learningOutcomes: string[];
  courseContent: string;
  labWork: string;
  entrepreneurialAspect: string;
}

export interface MasterCourseImportData {
  code: string;
  title: string;
  units: number;
  type: "GENERAL" | "CORE" | "ELECTIVE" | "REQUIRED" | "GST_NUC" | "GST_BU";
  ownership: "DEPARTMENT" | "SCHOOL" | "INSTITUTIONAL";
  level: number;
  /** 1, 2, or null for a sessional course with no semester (B13). */
  semester: number | null;
  description: string;
  learningOutcomes: string[];
  courseContent: string;
  labWork: string;
  entrepreneurialAspect: string;
  ownerDepartmentCode: string;
  ownerSchoolCode: string;
  programmeCodes: string[];
  curriculumSource: string;
  sourceReference: string;
  sourceProgrammes: string[];
  discoverable: boolean;
}

const UNIT_OPTIONS = Array.from(
  { length: MAX_COURSE_UNITS - MIN_COURSE_UNITS + 1 },
  (_, index) => String(MIN_COURSE_UNITS + index),
);

/** Reads the Semester cell: 1, 2, or null for a sessional course. */
function readSemester(
  raw: SpreadsheetRecord,
  errors: string[],
  warnings: string[],
): number | null {
  const semester = parseCourseSemester(importText(getImportValue(raw, ["Semester", "Sem"])));
  if (semester === undefined) {
    errors.push(SEMESTER_RULE_MESSAGE);
    return null;
  }
  if (semester === null) warnings.push("No semester: added as a sessional course that runs the whole year.");
  return semester;
}

export const COURSE_TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "code", label: "Course Code", required: true, guidance: "Use a code such as COS 101." },
  { key: "title", label: "Course Title", required: true },
  { key: "units", label: "Units", required: true, options: UNIT_OPTIONS, guidance: `A whole number from ${MIN_COURSE_UNITS} to ${MAX_COURSE_UNITS}.` },
  { key: "status", label: "Status", required: true, options: ["CORE", "ELECTIVE"] },
  { key: "semester", label: "Semester", options: ["1", "2", "Sessional"], guidance: "1 or 2; leave empty or write Sessional for a course that runs the whole year (for example MBBS)." },
  { key: "level", label: "Level", required: true, options: ["100", "200", "300", "400", "500", "600"] },
  { key: "prerequisites", label: "Prerequisites", guidance: "Optional course codes or prerequisite description." },
  { key: "learningOutcomes", label: "Learning Outcomes", guidance: "Separate multiple outcomes with |, semicolons, or new lines." },
  { key: "courseContent", label: "Course Content", guidance: "Detailed course description/content." },
  { key: "labWork", label: "Laboratory Work", guidance: "Optional; complete where applicable." },
  { key: "entrepreneurialAspect", label: "Entrepreneurial Aspect", guidance: "Optional practical or entrepreneurial component." },
];

export const COURSE_TEMPLATE_EXAMPLES = [[
  "COS 101",
  "Introduction to Computing",
  3,
  "CORE",
  1,
  100,
  "",
  "Explain computer systems | Apply basic problem-solving techniques",
  "Computer fundamentals, algorithms, and introductory programming.",
  "Weekly programming exercises.",
  "Develop a simple software solution.",
]];

export const MASTER_COURSE_TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "code", label: "Course Code", required: true },
  { key: "title", label: "Course Title", required: true },
  { key: "units", label: "Units", required: true, options: UNIT_OPTIONS, guidance: `A whole number from ${MIN_COURSE_UNITS} to ${MAX_COURSE_UNITS}.` },
  { key: "type", label: "Course Type", required: true, options: ["GENERAL", "CORE", "ELECTIVE", "REQUIRED", "GST_NUC", "GST_BU"] },
  { key: "ownership", label: "Ownership", required: true, options: ["DEPARTMENT", "SCHOOL", "INSTITUTIONAL"] },
  { key: "level", label: "Level", required: true, options: ["100", "200", "300", "400", "500", "600"] },
  { key: "semester", label: "Semester", options: ["1", "2", "Sessional"], guidance: "1 or 2; leave empty or write Sessional for a course that runs the whole year (for example MBBS)." },
  { key: "description", label: "Description" },
  { key: "learningOutcomes", label: "Learning Outcomes" },
  { key: "courseContent", label: "Course Content" },
  { key: "labWork", label: "Laboratory Work" },
  { key: "entrepreneurialAspect", label: "Entrepreneurial Aspect" },
  { key: "ownerDepartmentCode", label: "Owner Department Code" },
  { key: "ownerSchoolCode", label: "Owner School Code" },
  { key: "programmeCodes", label: "Programme Codes", guidance: "Separate multiple programme codes with |, semicolons, commas, or new lines. Courses are preloaded into these programmes." },
  { key: "curriculumSource", label: "Curriculum Source", guidance: "For official NUC courses, use CCMAS 2023." },
  { key: "sourceReference", label: "Source Reference", guidance: "Official discipline document or source URL." },
  { key: "sourceProgrammes", label: "Source Programmes", guidance: "Official programme names from the source, separated with |." },
  { key: "discoverable", label: "Discoverable" },
];

export const MASTER_COURSE_TEMPLATE_EXAMPLES = [[
  "GST 101",
  "Use of English",
  2,
  "GST_NUC",
  "INSTITUTIONAL",
  100,
  1,
  "University-wide communication course.",
  "Communicate clearly in academic settings | Produce well-structured written work",
  "Academic reading, writing, speaking, listening, and information literacy.",
  "Language laboratory and presentation exercises.",
  "Professional communication portfolio.",
  "",
  "",
  "BSC-COS | BSC-SE",
  "CCMAS 2023",
  "NUC Computing Discipline CCMAS",
  "Computer Science",
  "YES",
]];

function normalizedEnum(value: unknown): string {
  return importText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** A number from a cell; NaN when the cell is empty, so an empty Units cell is never read as 0 units. */
function numberValue(value: unknown): number {
  const text = importText(value);
  return text === "" ? Number.NaN : Number(text);
}

function learningOutcomes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(importText).filter(Boolean);
  }
  return importText(value)
    .split(/\r?\n|\s*\|\s*|\s*;\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function courseDuplicateKeys(course: { code: string; title: string }) {
  return {
    code: course.code.trim().toUpperCase(),
    title: course.title.trim().toLowerCase(),
  };
}

/**
 * Repeats within one upload (task B17). Departments share titles ("Research
 * Project", "Seminar"), so a title alone never makes a duplicate: only the
 * code does. The same code and title twice is a harmless repeat, skipped with
 * a warning; the same code with a different title is a real conflict.
 */
function checkRepeatInFile(
  firstTitleByCode: Map<string, string>,
  key: { code: string; title: string },
): { error?: string; warning?: string; skipped: boolean } {
  const firstTitle = firstTitleByCode.get(key.code);
  if (firstTitle === undefined) {
    firstTitleByCode.set(key.code, key.title);
    return { skipped: false };
  }
  if (firstTitle === key.title) {
    return { warning: "Listed again in this file; this repeat is skipped.", skipped: true };
  }
  return { error: "Course Code is listed twice in this file with different titles.", skipped: false };
}

export function validateCourseImportRows(
  rows: SpreadsheetRecord[],
  options: {
    allowedLevels?: number[];
    existingCodes?: Iterable<string>;
    /** No longer used: titles may repeat under different codes (B17). */
    existingTitles?: Iterable<string>;
  } = {},
): ValidatedImportRow<CourseImportData>[] {
  const allowedLevels = options.allowedLevels || [100, 200, 300, 400, 500, 600];
  const existingCodes = new Set(Array.from(options.existingCodes || [], (value) => value.toUpperCase()));
  const firstTitleByCode = new Map<string, string>();

  return rows.map((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rawCode = importText(getImportValue(raw, ["Course Code", "Code"]));
    const rawTitle = importText(getImportValue(raw, ["Course Title", "Title"]));
    const code = formatCourseCode(rawCode);
    const title = cleanCourseTitle(rawTitle, rawCode);
    const units = numberValue(getImportValue(raw, ["Units", "Credit Units"]));
    const statusInput = normalizedEnum(getImportValue(raw, ["Status", "Course Status"]) || "CORE");
    const semester = readSemester(raw, errors, warnings);
    const level = numberValue(getImportValue(raw, ["Level"]));
    const prerequisites = importText(getImportValue(raw, ["Prerequisites", "Prerequisite"]));

    if (!isValidCourseCode(rawCode)) errors.push("Invalid course code; use a format such as COS 101 or BU-COS 101.");
    if (!title) errors.push("Course Title is required.");
    if (!isValidCourseUnits(units)) errors.push(UNITS_RULE_MESSAGE);
    if (!["CORE", "ELECTIVE"].includes(statusInput)) errors.push("Status must be CORE or ELECTIVE.");
    if (!allowedLevels.includes(level)) errors.push(`Level must be one of: ${allowedLevels.join(", ")}.`);

    const duplicate = courseDuplicateKeys({ code, title });
    let skipped = false;
    if (existingCodes.has(duplicate.code)) {
      errors.push("Course Code is duplicated or already exists.");
    } else {
      const repeat = checkRepeatInFile(firstTitleByCode, duplicate);
      if (repeat.error) errors.push(repeat.error);
      if (repeat.warning) warnings.push(repeat.warning);
      skipped = repeat.skipped;
    }

    const data: CourseImportData = {
      code,
      title,
      units,
      status: statusInput === "ELECTIVE" ? "ELECTIVE" : "CORE",
      semester,
      level,
      prerequisites,
      learningOutcomes: learningOutcomes(getImportValue(raw, ["Learning Outcomes", "Outcomes"])),
      courseContent: importText(getImportValue(raw, ["Course Content", "Content"])),
      labWork: importText(getImportValue(raw, ["Laboratory Work", "Lab Work"])),
      entrepreneurialAspect: importText(
        getImportValue(raw, ["Entrepreneurial Aspect", "Entrepreneurship"]),
      ),
    };
    return { rowNumber: index + 2, raw, data, errors, warnings, skipped };
  });
}

export function validateMasterCourseImportRows(
  rows: SpreadsheetRecord[],
  options: {
    existingCodes?: Iterable<string>;
    /** No longer used: titles may repeat under different codes (B17). */
    existingTitles?: Iterable<string>;
    allowExisting?: boolean;
  } = {},
): ValidatedImportRow<MasterCourseImportData>[] {
  const existingCodes = new Set(Array.from(options.existingCodes || [], (value) => value.toUpperCase()));
  const firstTitleByCode = new Map<string, string>();
  const types = ["GENERAL", "CORE", "ELECTIVE", "REQUIRED", "GST_NUC", "GST_BU"];
  const ownerships = ["DEPARTMENT", "SCHOOL", "INSTITUTIONAL"];

  return rows.map((raw, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const rawCode = importText(getImportValue(raw, ["Course Code", "Code"]));
    const rawTitle = importText(getImportValue(raw, ["Course Title", "Title"]));
    const code = formatCourseCode(rawCode);
    const title = cleanCourseTitle(rawTitle, rawCode);
    const units = numberValue(getImportValue(raw, ["Units", "Credit Units"]));
    const type = normalizedEnum(getImportValue(raw, ["Course Type", "Type"]) || "CORE");
    const ownership = normalizedEnum(getImportValue(raw, ["Ownership"]) || "DEPARTMENT");
    const level = numberValue(getImportValue(raw, ["Level"]));
    const semester = readSemester(raw, errors, warnings);
    const ownerDepartmentCode = importText(getImportValue(raw, ["Owner Department Code", "Department Code"])).toUpperCase();
    const ownerSchoolCode = importText(getImportValue(raw, ["Owner School Code", "School Code"])).toUpperCase();

    if (!isValidCourseCode(rawCode)) errors.push("Invalid course code; use a format such as GST 101 or BU-GST 112.");
    if (!title) errors.push("Course Title is required.");
    if (!isValidCourseUnits(units)) errors.push(UNITS_RULE_MESSAGE);
    if (!types.includes(type)) errors.push("Invalid Course Type.");
    if (!ownerships.includes(ownership)) errors.push("Invalid Ownership.");
    if (![100, 200, 300, 400, 500, 600].includes(level)) errors.push("Level must be 100, 200, 300, 400, 500, or 600.");
    if (ownership === "DEPARTMENT" && !ownerDepartmentCode) errors.push("Owner Department Code is required.");
    if (ownership === "SCHOOL" && !ownerSchoolCode) errors.push("Owner School Code is required.");
    if (["GST_NUC", "GST_BU"].includes(type) && ownership !== "INSTITUTIONAL") {
      errors.push("GST courses must use INSTITUTIONAL ownership.");
    }

    const duplicate = courseDuplicateKeys({ code, title });
    const repeat = checkRepeatInFile(firstTitleByCode, duplicate);
    if (repeat.error) errors.push(repeat.error);
    if (repeat.warning) warnings.push(repeat.warning);
    if (!repeat.skipped && !options.allowExisting && existingCodes.has(duplicate.code)) {
      errors.push("Course Code already exists.");
    }

    const data: MasterCourseImportData = {
      code,
      title,
      units,
      type: types.includes(type) ? (type as MasterCourseImportData["type"]) : "CORE",
      ownership: ownerships.includes(ownership)
        ? (ownership as MasterCourseImportData["ownership"])
        : "DEPARTMENT",
      level,
      semester,
      description: importText(getImportValue(raw, ["Description", "Course Description"])),
      learningOutcomes: learningOutcomes(
        getImportValue(raw, ["Learning Outcomes", "Outcomes"]),
      ),
      courseContent: importText(
        getImportValue(raw, ["Course Content", "Content"]),
      ),
      labWork: importText(
        getImportValue(raw, ["Laboratory Work", "Lab Work"]),
      ),
      entrepreneurialAspect: importText(
        getImportValue(raw, ["Entrepreneurial Aspect", "Entrepreneurship"]),
      ),
      ownerDepartmentCode,
      ownerSchoolCode,
      programmeCodes: importText(
        getImportValue(raw, ["Programme Codes", "Program Codes", "Programmes"]),
      )
        .split(/\r?\n|\s*\|\s*|\s*;\s*|\s*,\s*/)
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean),
      curriculumSource: importText(
        getImportValue(raw, ["Curriculum Source", "Source"]),
      ),
      sourceReference: importText(
        getImportValue(raw, ["Source Reference", "Reference"]),
      ),
      sourceProgrammes: importText(
        getImportValue(raw, ["Source Programmes", "Source Programme"]),
      )
        .split(/\r?\n|\s*\|\s*|\s*;\s*/)
        .map((value) => value.trim())
        .filter(Boolean),
      discoverable: importBoolean(getImportValue(raw, ["Discoverable"]), true),
    };
    return { rowNumber: index + 2, raw, data, errors, warnings, skipped: repeat.skipped };
  });
}
