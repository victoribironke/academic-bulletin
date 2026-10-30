import { isValidName, toTitleCase } from "@/lib/validation/name-format";
import {
  getImportValue,
  importText,
  type SpreadsheetRecord,
  type TemplateColumn,
  type ValidatedImportRow,
} from "@/lib/imports/spreadsheet";

export interface StaffImportData {
  title: string;
  gender: string;
  surname: string;
  middleName: string;
  firstName: string;
  highestQualification: string;
  academicRank: string;
  customJobTitle: string;
  specialization: string;
  email: string;
  type: "ACADEMIC" | "ADJUNCT" | "NON_ACADEMIC";
}

export const STAFF_TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "type", label: "Staff Type", required: true, options: ["ACADEMIC", "ADJUNCT", "NON_ACADEMIC"] },
  { key: "title", label: "Title", required: true, options: ["MR", "MRS", "MS", "DR", "PROF", "ENGR", "BARR", "REV", "PASTOR"] },
  { key: "surname", label: "Surname", required: true },
  { key: "firstName", label: "First Name", required: true },
  { key: "middleName", label: "Middle Name" },
  { key: "gender", label: "Gender", required: true, options: ["MALE", "FEMALE"] },
  { key: "highestQualification", label: "Highest Qualification", required: true, options: ["PHD", "MASTERS", "BACHELOR", "HND", "OND"] },
  { key: "academicRank", label: "Academic Rank / Job Title", required: true, options: ["PROFESSOR", "ASSOCIATE_PROFESSOR", "SENIOR_LECTURER", "LECTURER_I", "LECTURER_II", "ASSISTANT_LECTURER", "GRADUATE_ASSISTANT", "OTHER"] },
  { key: "customJobTitle", label: "Custom Job Title", guidance: "Required when Academic Rank / Job Title is OTHER." },
  { key: "specialization", label: "Specialization" },
  { key: "email", label: "Email", guidance: "Optional. If supplied, enter a valid email address." },
];

export const STAFF_TEMPLATE_EXAMPLES = [
  [
    "ACADEMIC",
    "DR",
    "Okonkwo",
    "Chidi",
    "Emeka",
    "MALE",
    "PHD",
    "SENIOR_LECTURER",
    "",
    "Data Science",
    "chidi.okonkwo@babcock.edu.ng",
  ],
  [
    "ADJUNCT",
    "PROF",
    "Adebayo",
    "Tunde",
    "",
    "MALE",
    "PHD",
    "PROFESSOR",
    "",
    "Commercial Law",
    "tunde.adebayo@babcock.edu.ng",
  ],
  [
    "NON_ACADEMIC",
    "MRS",
    "Adeyemi",
    "Bola",
    "",
    "FEMALE",
    "BACHELOR",
    "OTHER",
    "Laboratory Technologist",
    "",
    "bola.adeyemi@babcock.edu.ng",
  ],
];

const TITLES = ["MR", "MRS", "MS", "DR", "PROF", "ENGR", "BARR", "REV", "PASTOR"];
const QUALIFICATIONS = ["PHD", "MASTERS", "BACHELOR", "HND", "OND"];
const RANKS = [
  "PROFESSOR",
  "ASSOCIATE_PROFESSOR",
  "SENIOR_LECTURER",
  "LECTURER_I",
  "LECTURER_II",
  "ASSISTANT_LECTURER",
  "GRADUATE_ASSISTANT",
  "OTHER",
];

function enumValue(value: unknown): string {
  return importText(value)
    .toUpperCase()
    .replaceAll(".", "")
    .replace(/['’]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeQualification(value: unknown): string {
  const normalized = enumValue(value);
  if (/(^|_)PHD($|_)|DOCTOR/.test(normalized)) return "PHD";
  if (/(^|_)(MASTERS?|MSC|M_SC|MA|MBA|LLM|LL_M)($|_)/.test(normalized)) return "MASTERS";
  if (/(^|_)(BACHELORS?|BSC|B_SC|BA|LLB|LL_B)($|_)/.test(normalized)) return "BACHELOR";
  if (/(^|_)HND($|_)/.test(normalized)) return "HND";
  if (/(^|_)OND($|_)/.test(normalized)) return "OND";
  const aliases: Record<string, string> = {
    PHD_DEGREE: "PHD",
    DOCTORATE: "PHD",
    MASTER: "MASTERS",
    MASTERS_DEGREE: "MASTERS",
    BACHELORS: "BACHELOR",
    BACHELORS_DEGREE: "BACHELOR",
  };
  return aliases[normalized] || normalized;
}

function normalizeType(value: unknown): StaffImportData["type"] | "" {
  const normalized = enumValue(value || "ACADEMIC");
  if (normalized === "NONACADEMIC") return "NON_ACADEMIC";
  if (
    [
      "ADJUNCT_ACADEMIC",
      "ADJUNCT_ACADEMIC_STAFF",
      "ADJUNCT_STAFF",
      "ADJUNCT_LECTURER",
    ].includes(normalized)
  ) {
    return "ADJUNCT";
  }
  if (["ACADEMIC_STAFF", "ACADEMIC_MEMBER", "TEACHING_STAFF"].includes(normalized)) {
    return "ACADEMIC";
  }
  if (["NON_ACADEMIC_STAFF", "NON_TEACHING_STAFF", "SUPPORT_STAFF"].includes(normalized)) {
    return "NON_ACADEMIC";
  }
  if (["ACADEMIC", "ADJUNCT", "NON_ACADEMIC"].includes(normalized)) {
    return normalized as StaffImportData["type"];
  }
  return "";
}

function normalizeTitle(value: unknown): string {
  const normalized = enumValue(value);
  const aliases: Record<string, string> = {
    PROFESSOR: "PROF",
    ENGINEER: "ENGR",
    BARRISTER: "BARR",
    REVEREND: "REV",
    MISS: "MS",
  };
  return aliases[normalized] || normalized;
}

function normalizeGender(value: unknown): string {
  const normalized = enumValue(value);
  if (normalized === "M") return "MALE";
  if (normalized === "F") return "FEMALE";
  return normalized;
}

function normalizeRank(value: unknown): string {
  const normalized = enumValue(value);
  const aliases: Record<string, string> = {
    ASSOC_PROF: "ASSOCIATE_PROFESSOR",
    ASSOCIATE_PROF: "ASSOCIATE_PROFESSOR",
    READER: "ASSOCIATE_PROFESSOR",
    LECTURER_1: "LECTURER_I",
    LECTURER_ONE: "LECTURER_I",
    LECTURER_2: "LECTURER_II",
    LECTURER_TWO: "LECTURER_II",
  };
  return aliases[normalized] || normalized;
}

export function staffDuplicateKey(staff: {
  email?: string | null;
  surname: string;
  firstName: string;
  middleName?: string | null;
}): string {
  const email = staff.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  return `name:${[staff.surname, staff.firstName, staff.middleName || ""]
    .map((value) => value.trim().toLowerCase())
    .join("|")}`;
}

export function validateStaffImportRows(
  rows: SpreadsheetRecord[],
  existingKeys: Iterable<string> = [],
): ValidatedImportRow<StaffImportData>[] {
  const seen = new Set(existingKeys);

  return rows.map((raw, index) => {
    const errors: string[] = [];
    const type = normalizeType(getImportValue(raw, ["Staff Type", "Type"]));
    const title = normalizeTitle(getImportValue(raw, ["Title"]));
    const gender = normalizeGender(getImportValue(raw, ["Gender", "Sex"]));
    const surname = importText(getImportValue(raw, ["Surname", "Last Name"]));
    const firstName = importText(getImportValue(raw, ["First Name", "Firstname"]));
    const middleName = importText(getImportValue(raw, ["Middle Name", "Middlename"]));
    const highestQualification = normalizeQualification(
      getImportValue(raw, ["Highest Qualification", "Qualification"]),
    );
    const rankInput = importText(
      getImportValue(raw, ["Academic Rank / Job Title", "Academic Rank", "Rank", "Job Title"]),
    );
    let academicRank = normalizeRank(rankInput);
    let customJobTitle = importText(
      getImportValue(raw, ["Custom Job Title", "Custom Title"]),
    );
    const specialization = importText(getImportValue(raw, ["Specialization", "Specialisation"]));
    const email = importText(getImportValue(raw, ["Email", "Email Address"])).toLowerCase();

    if (!type) errors.push("Staff Type must be ACADEMIC, ADJUNCT, or NON_ACADEMIC.");
    if (!TITLES.includes(title)) errors.push(`Invalid title "${title || "blank"}".`);
    if (!["MALE", "FEMALE"].includes(gender)) errors.push("Gender must be MALE or FEMALE.");
    if (!surname || !isValidName(surname)) errors.push("Enter a valid surname.");
    if (!firstName || !isValidName(firstName)) errors.push("Enter a valid first name.");
    if (middleName && !isValidName(middleName)) errors.push("Enter a valid middle name.");
    if (!QUALIFICATIONS.includes(highestQualification)) errors.push("Invalid highest qualification.");

    if (type === "NON_ACADEMIC" && !RANKS.includes(academicRank)) {
      customJobTitle = customJobTitle || toTitleCase(rankInput.replaceAll("_", " "));
      academicRank = "OTHER";
    }
    if (!RANKS.includes(academicRank)) errors.push("Invalid academic rank.");
    if (academicRank === "OTHER" && !customJobTitle) {
      errors.push("Custom Job Title is required when the rank is OTHER.");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Enter a valid email address.");
    }

    const data: StaffImportData = {
      title,
      gender,
      surname,
      middleName,
      firstName,
      highestQualification,
      academicRank,
      customJobTitle,
      specialization,
      email,
      type: type || "ACADEMIC",
    };
    const duplicateKey = staffDuplicateKey(data);
    if (seen.has(duplicateKey)) errors.push("This staff member is duplicated or already exists.");
    seen.add(duplicateKey);

    return { rowNumber: index + 2, raw, data, errors };
  });
}
