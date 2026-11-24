/**
 * The 135 courses the old upload template could not hold (package file 03,
 * sheet "Not uploaded"; work order task B13): 0-unit Citizenship
 * Orientation, the 12-unit internship, and sessional courses with no
 * semester (mostly MBBS). The sheet lists only code, title, units, level,
 * semester and programme names, so this turns each row into a Registry
 * upload row with stated defaults, and says which default it used:
 *
 * - General Education courses (Citizenship Orientation) are university-wide
 *   (decision DEC8).
 * - Other courses belong to their programme's department, except the basic
 *   medical sciences, which go to their own departments (file 10). DAP
 *   confirms owners in B6.
 * - MBBS courses with no semester are sessional (W17); any other course with
 *   no semester takes the one its number implies (W10).
 * - Courses with no units or no title in the source wait for DAP.
 */
import { matchProgrammeNames } from "@/lib/courses/programme-matching";
import { isGeneralEducationCode } from "@/lib/courses/general-education";
import { getImportValue, importText, type SpreadsheetRecord } from "@/lib/imports/spreadsheet";

export const HELD_BACK_SHEET = "Not uploaded";
export const HELD_BACK_SOURCE = "BU Bulletin 2023-2027";
export const HELD_BACK_REFERENCE = 'Package file 03, sheet "Not uploaded"';

/** MBBS course prefixes taught by the basic medical sciences departments (file 10, School SBMS). */
export const PREFIX_OWNERS: Record<string, string> = {
  ANAT: "SBMS-ANA",
  BCHM: "SBMS-BCH",
  PHGY: "SBMS-PIO",
};

export type HeldBackProgramme = {
  id: string;
  code: string;
  name: string;
  degreeType: string | null;
  departmentCode: string;
};

export type HeldBackConversion = {
  rows: SpreadsheetRecord[];
  /** How each row's owner and links were set. */
  notes: { code: string; note: string }[];
  /** Rows not uploaded yet, with the reason. */
  waiting: { code: string; title: string; reason: string }[];
  unmatchedProgrammeNames: string[];
};

const splitNames = (value: unknown) =>
  importText(value)
    .split(/\s*\|\s*/)
    .map((name) => name.trim())
    .filter(Boolean);

export function convertHeldBackRows(records: SpreadsheetRecord[], programmes: HeldBackProgramme[]): HeldBackConversion {
  const rows: SpreadsheetRecord[] = [];
  const notes: HeldBackConversion["notes"] = [];
  const waiting: HeldBackConversion["waiting"] = [];
  const unmatched = new Set<string>();
  const byId = new Map(programmes.map((programme) => [programme.id, programme]));

  for (const record of records) {
    const code = importText(getImportValue(record, ["Course Code", "Code"]));
    const title = importText(getImportValue(record, ["Course Title", "Title"]));
    const units = importText(getImportValue(record, ["Units"]));
    if (!code) continue;
    if (units === "" || title === "") {
      const missing = [units === "" && "units", title === "" && "title"].filter(Boolean).join(" or ");
      waiting.push({ code, title, reason: `No ${missing} in the source: DAP to supply ${units === "" ? "them" : "it"}.` });
      continue;
    }

    const names = splitNames(getImportValue(record, ["Programmes", "Programme"]));
    const match = matchProgrammeNames(names, programmes);
    match.unmatchedNames.forEach((name) => unmatched.add(name));
    match.ambiguousNames.forEach((name) => unmatched.add(name));
    const linked = match.matchedIds.map((id) => byId.get(id)!).filter(Boolean);

    // MBBS runs by Part and year, so its courses are sessional (W17). For any
    // other course the source just doesn't say: take the semester its number
    // implies (W10: odd first, even second; ending in 0, either).
    let semester = importText(getImportValue(record, ["Semester"]));
    const onlyMbbs = linked.length > 0 && linked.every((programme) => /^MBBS$/i.test(programme.degreeType ?? ""));
    if (semester === "" && !onlyMbbs) {
      const last = Number(code.slice(-1));
      if (last > 0) {
        semester = last % 2 === 1 ? "1" : "2";
        notes.push({ code, note: `Semester ${semester} from the course number (W10); the source gives none.` });
      }
    }

    const generalEducation = isGeneralEducationCode(code);
    let ownerDepartmentCode = "";
    if (!generalEducation) {
      const prefix = code.toUpperCase().split(/\s+/)[0];
      const departments = [...new Set(linked.map((programme) => programme.departmentCode))];
      ownerDepartmentCode = PREFIX_OWNERS[prefix] ?? (departments.length === 1 ? departments[0] : "");
      notes.push({
        code,
        note: PREFIX_OWNERS[prefix]
          ? `Owner ${ownerDepartmentCode} (basic medical sciences prefix ${prefix}); DAP to confirm (B6).`
          : departments.length === 1
            ? `Owner ${ownerDepartmentCode}, the department of ${linked[0].name}; DAP to confirm (B6).`
            : `No single programme department to own it (${linked.length} programmes); needs an owner from DAP.`,
      });
    }

    rows.push({
      "Course Code": code,
      "Course Title": title,
      Units: units,
      "Course Type": generalEducation ? "GST_BU" : "CORE",
      Ownership: generalEducation ? "INSTITUTIONAL" : "DEPARTMENT",
      Level: importText(getImportValue(record, ["Level"])),
      Semester: semester,
      "Owner Department Code": ownerDepartmentCode,
      "Programme Codes": linked.map((programme) => programme.code).join(" | "),
      "Curriculum Source": HELD_BACK_SOURCE,
      "Source Reference": HELD_BACK_REFERENCE,
      "Source Programmes": names.join(" | "),
      Discoverable: "YES",
    });
  }

  return { rows, notes, waiting, unmatchedProgrammeNames: [...unmatched].sort() };
}
