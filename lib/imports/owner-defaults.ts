/**
 * Default owners for courses that come without one (work order task B6),
 * used "until DAP says otherwise". File 07 version 2 already has them; the
 * script applies them to any other package row that has no owner, and says
 * so in its report. A row that names an owner is never changed.
 */
import { getImportValue, importText, type SpreadsheetRecord } from "@/lib/imports/spreadsheet";

type OwnerDefault = { match: RegExp; school?: string; department?: string; owner: string };

export const B6_OWNER_DEFAULTS: OwnerDefault[] = [
  { match: /^AMS \d/, school: "SMSC", owner: "School of Management Sciences" },
  { match: /^FAC \d/, school: "JSEH", owner: "School of Education and Humanities" },
  { match: /^SSC \d/, school: "VSSS", owner: "Veronica Adeleke School of Social Sciences" },
  { match: /^BU-GEG \d/, school: "SOEN", owner: "School of Engineering" },
  { match: /^(PHY|STA) \d/, department: "SSAT-BAS", owner: "Department of Basic and Applied Sciences" },
  { match: /^ICT 305$/, department: "SOCO-IFT", owner: "Information Technology" },
  { match: /^TEL 305$/, department: "SOEN-EEE", owner: "Electrical and Electronics Engineering" },
];

/** Fills B6 default owners into rows that have none; returns the rows and a note for each one filled. */
export function applyOwnerDefaults(rows: SpreadsheetRecord[]) {
  const notes: { code: string; note: string }[] = [];
  const filled = rows.map((row) => {
    const code = importText(getImportValue(row, ["Course Code", "Code"])).toUpperCase().replace(/\s+/g, " ");
    const ownership = importText(getImportValue(row, ["Ownership"])).toUpperCase() || "DEPARTMENT";
    const department = importText(getImportValue(row, ["Owner Department Code", "Department Code"]));
    const school = importText(getImportValue(row, ["Owner School Code", "School Code"]));
    const missing = (ownership === "DEPARTMENT" && !department) || (ownership === "SCHOOL" && !school);
    const rule = missing ? B6_OWNER_DEFAULTS.find((entry) => entry.match.test(code)) : undefined;
    if (!rule) return row;
    notes.push({ code, note: `Owner: ${rule.owner} (${rule.school ?? rule.department}), the work order's default (B6); DAP can change it.` });
    return rule.school
      ? { ...row, Ownership: "SCHOOL", "Owner School Code": rule.school }
      : { ...row, Ownership: "DEPARTMENT", "Owner Department Code": rule.department };
  });
  return { rows: filled, notes };
}
