import {
  formatCourseCode,
  formatCourseTitle,
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

export interface CourseImportData {
  code: string;
  title: string;
  units: number;
  status: "CORE" | "ELECTIVE";
  semester: number;
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
  semester: number;
  description: string;
  learningOutcomes: string[];
  courseContent: string;
  labWork: string;
  entrepreneurialAspect: string;
  ownerDepartmentCode: string;
  ownerSchoolCode: string;
  discoverable: boolean;
}

export const COURSE_TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "code", label: "Course Code" },
  { key: "title", label: "Course Title" },
  { key: "units", label: "Units" },
  { key: "status", label: "Status" },
  { key: "semester", label: "Semester" },
  { key: "level", label: "Level" },
  { key: "prerequisites", label: "Prerequisites" },
  { key: "learningOutcomes", label: "Learning Outcomes" },
  { key: "courseContent", label: "Course Content" },
  { key: "labWork", label: "Laboratory Work" },
  { key: "entrepreneurialAspect", label: "Entrepreneurial Aspect" },
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
  { key: "code", label: "Course Code" },
  { key: "title", label: "Course Title" },
  { key: "units", label: "Units" },
  { key: "type", label: "Course Type" },
  { key: "ownership", label: "Ownership" },
  { key: "level", label: "Level" },
  { key: "semester", label: "Semester" },
  { key: "description", label: "Description" },
  { key: "learningOutcomes", label: "Learning Outcomes" },
  { key: "courseContent", label: "Course Content" },
  { key: "labWork", label: "Laboratory Work" },
  { key: "entrepreneurialAspect", label: "Entrepreneurial Aspect" },
  { key: "ownerDepartmentCode", label: "Owner Department Code" },
  { key: "ownerSchoolCode", label: "Owner School Code" },
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
  "YES",
]];

function normalizedEnum(value: unknown): string {
  return importText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function numberValue(value: unknown): number {
  return Number(importText(value));
}

function learningOutcomes(value: unknown): string[] {
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

export function validateCourseImportRows(
  rows: SpreadsheetRecord[],
  options: {
    allowedLevels?: number[];
    existingCodes?: Iterable<string>;
    existingTitles?: Iterable<string>;
  } = {},
): ValidatedImportRow<CourseImportData>[] {
  const allowedLevels = options.allowedLevels || [100, 200, 300, 400, 500, 600];
  const seenCodes = new Set(Array.from(options.existingCodes || [], (value) => value.toUpperCase()));
  const seenTitles = new Set(Array.from(options.existingTitles || [], (value) => value.toLowerCase()));

  return rows.map((raw, index) => {
    const errors: string[] = [];
    const rawCode = importText(getImportValue(raw, ["Course Code", "Code"]));
    const rawTitle = importText(getImportValue(raw, ["Course Title", "Title"]));
    const code = formatCourseCode(rawCode);
    const title = formatCourseTitle(rawTitle);
    const units = numberValue(getImportValue(raw, ["Units", "Credit Units"]));
    const statusInput = normalizedEnum(getImportValue(raw, ["Status", "Course Status"]) || "CORE");
    const semester = numberValue(getImportValue(raw, ["Semester", "Sem"]));
    const level = numberValue(getImportValue(raw, ["Level"]));
    const prerequisites = importText(getImportValue(raw, ["Prerequisites", "Prerequisite"]));

    if (!isValidCourseCode(rawCode)) errors.push("Invalid course code; use a format such as COS 101.");
    if (!title) errors.push("Course Title is required.");
    if (!Number.isInteger(units) || units < 1 || units > 6) errors.push("Units must be a whole number from 1 to 6.");
    if (!["CORE", "ELECTIVE"].includes(statusInput)) errors.push("Status must be CORE or ELECTIVE.");
    if (![1, 2].includes(semester)) errors.push("Semester must be 1 or 2.");
    if (!allowedLevels.includes(level)) errors.push(`Level must be one of: ${allowedLevels.join(", ")}.`);

    const duplicate = courseDuplicateKeys({ code, title });
    if (seenCodes.has(duplicate.code)) errors.push("Course Code is duplicated or already exists.");
    if (seenTitles.has(duplicate.title)) errors.push("Course Title is duplicated or already exists.");
    seenCodes.add(duplicate.code);
    seenTitles.add(duplicate.title);

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
    return { rowNumber: index + 2, raw, data, errors };
  });
}

export function validateMasterCourseImportRows(
  rows: SpreadsheetRecord[],
  options: { existingCodes?: Iterable<string>; existingTitles?: Iterable<string> } = {},
): ValidatedImportRow<MasterCourseImportData>[] {
  const seenCodes = new Set(Array.from(options.existingCodes || [], (value) => value.toUpperCase()));
  const seenTitles = new Set(Array.from(options.existingTitles || [], (value) => value.toLowerCase()));
  const types = ["GENERAL", "CORE", "ELECTIVE", "REQUIRED", "GST_NUC", "GST_BU"];
  const ownerships = ["DEPARTMENT", "SCHOOL", "INSTITUTIONAL"];

  return rows.map((raw, index) => {
    const errors: string[] = [];
    const rawCode = importText(getImportValue(raw, ["Course Code", "Code"]));
    const rawTitle = importText(getImportValue(raw, ["Course Title", "Title"]));
    const code = formatCourseCode(rawCode);
    const title = formatCourseTitle(rawTitle);
    const units = numberValue(getImportValue(raw, ["Units", "Credit Units"]));
    const type = normalizedEnum(getImportValue(raw, ["Course Type", "Type"]) || "CORE");
    const ownership = normalizedEnum(getImportValue(raw, ["Ownership"]) || "DEPARTMENT");
    const level = numberValue(getImportValue(raw, ["Level"]));
    const semester = numberValue(getImportValue(raw, ["Semester", "Sem"]));
    const ownerDepartmentCode = importText(getImportValue(raw, ["Owner Department Code", "Department Code"])).toUpperCase();
    const ownerSchoolCode = importText(getImportValue(raw, ["Owner School Code", "School Code"])).toUpperCase();

    if (!isValidCourseCode(rawCode)) errors.push("Invalid course code; use a format such as GST 101.");
    if (!title) errors.push("Course Title is required.");
    if (!Number.isInteger(units) || units < 1 || units > 6) errors.push("Units must be a whole number from 1 to 6.");
    if (!types.includes(type)) errors.push("Invalid Course Type.");
    if (!ownerships.includes(ownership)) errors.push("Invalid Ownership.");
    if (![100, 200, 300, 400, 500].includes(level)) errors.push("Level must be 100, 200, 300, 400, or 500.");
    if (![1, 2].includes(semester)) errors.push("Semester must be 1 or 2.");
    if (ownership === "DEPARTMENT" && !ownerDepartmentCode) errors.push("Owner Department Code is required.");
    if (ownership === "SCHOOL" && !ownerSchoolCode) errors.push("Owner School Code is required.");
    if (["GST_NUC", "GST_BU"].includes(type) && ownership !== "INSTITUTIONAL") {
      errors.push("GST courses must use INSTITUTIONAL ownership.");
    }

    const duplicate = courseDuplicateKeys({ code, title });
    if (seenCodes.has(duplicate.code)) errors.push("Course Code is duplicated or already exists.");
    if (seenTitles.has(duplicate.title)) errors.push("Course Title is duplicated or already exists.");
    seenCodes.add(duplicate.code);
    seenTitles.add(duplicate.title);

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
      discoverable: importBoolean(getImportValue(raw, ["Discoverable"]), true),
    };
    return { rowNumber: index + 2, raw, data, errors };
  });
}
