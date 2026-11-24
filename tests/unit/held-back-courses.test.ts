import { describe, expect, it } from "vitest";
import { convertHeldBackRows, type HeldBackProgramme } from "@/lib/imports/held-back-courses";
import { validateMasterCourseImportRows } from "@/lib/imports/courses";
import { applyOwnerDefaults } from "@/lib/imports/owner-defaults";
import { sameCourseTitle } from "@/lib/imports/registry-upload";

// Task B13: file 03's "Not uploaded" rows become Registry upload rows with
// stated defaults, and pass the same checks as any upload.

const programmes: HeldBackProgramme[] = [
  { id: "mbbs", code: "SBMS-MED-MBBS", name: "Medicine and Surgery", degreeType: "MBBS", departmentCode: "SBMS-MED" },
  { id: "pbh", code: "SAHS-PBH-PBH", name: "Public Health", degreeType: "B.Sc.", departmentCode: "SAHS-PBH" },
  { id: "acc", code: "SMSC-ACC-ACC", name: "Accounting", degreeType: "B.Sc.", departmentCode: "SMSC-ACC" },
  { id: "irm", code: "SOCO-IRM-IRM", name: "Information Resources Management", degreeType: "B.Sc.", departmentCode: "SOCO-IRM" },
];

const sheet = [
  { "Course Code": "ANAT 223", "Course Title": "Gross Anatomy I", Units: 3, Level: 200, Semester: "", Programmes: "Medicine and Surgery", Reason: "no semester" },
  { "Course Code": "MEDI 301", "Course Title": "Clinical Medicine I", Units: 1, Level: 300, Semester: "", Programmes: "Medicine and Surgery", Reason: "no semester" },
  { "Course Code": "SURG 401", "Course Title": "Surgery Posting I", Units: "", Level: 400, Semester: "", Programmes: "Medicine and Surgery", Reason: "units missing" },
  { "Course Code": "PATH 304", "Course Title": "", Units: 2, Level: 300, Semester: "", Programmes: "Medicine and Surgery", Reason: "no semester" },
  {
    "Course Code": "BU-GST 011",
    "Course Title": "Citizenship Orientation",
    Units: 0,
    Level: 100,
    Semester: 1,
    Programmes: "Accounting | Medicine and Surgery | Anatomy",
    Reason: "0 units",
  },
  { "Course Code": "BU-PHS 416", "Course Title": "Internship", Units: 12, Level: 400, Semester: 2, Programmes: "Public Health", Reason: "12 units" },
  { "Course Code": "IRM 107", "Course Title": "Fundamentals Resources Management", Units: 3, Level: 100, Semester: "", Programmes: "Information Resources Management", Reason: "no semester" },
  { "Course Code": "IRM 204", "Course Title": "Cataloguing", Units: 3, Level: 200, Semester: "", Programmes: "Information Resources Management", Reason: "no semester" },
];

describe("held-back courses (B13)", () => {
  const converted = convertHeldBackRows(sheet, programmes);
  const byCode = new Map(converted.rows.map((row) => [row["Course Code"], row]));

  it("leaves courses with no units or no title for DAP", () => {
    expect(converted.waiting).toEqual([
      { code: "SURG 401", title: "Surgery Posting I", reason: "No units in the source: DAP to supply them." },
      { code: "PATH 304", title: "", reason: "No title in the source: DAP to supply it." },
    ]);
    expect(byCode.has("SURG 401")).toBe(false);
    expect(converted.rows).toHaveLength(6);
  });

  it("gives basic medical sciences courses their own department, others their programme's", () => {
    expect(byCode.get("ANAT 223")).toMatchObject({
      "Owner Department Code": "SBMS-ANA",
      Ownership: "DEPARTMENT",
      "Course Type": "CORE",
      "Programme Codes": "SBMS-MED-MBBS",
    });
    expect(byCode.get("MEDI 301")).toMatchObject({ "Owner Department Code": "SBMS-MED" });
    expect(byCode.get("BU-PHS 416")).toMatchObject({ "Owner Department Code": "SAHS-PBH", Units: "12" });
    expect(converted.notes.find((note) => note.code === "MEDI 301")?.note).toContain("DAP to confirm (B6)");
  });

  it("makes Citizenship Orientation university-wide and lists names with no programme", () => {
    expect(byCode.get("BU-GST 011")).toMatchObject({
      "Course Type": "GST_BU",
      Ownership: "INSTITUTIONAL",
      "Owner Department Code": "",
      "Programme Codes": "SMSC-ACC-ACC | SBMS-MED-MBBS",
    });
    expect(converted.unmatchedProgrammeNames).toEqual(["Anatomy"]);
  });

  it("passes the upload checks: 0 and 12 units, sessional with no semester", () => {
    const validated = validateMasterCourseImportRows(converted.rows, { allowExisting: true });
    expect(validated.flatMap((row) => row.errors)).toEqual([]);
    const anatomy = validated.find((row) => row.data?.code === "ANAT 223")!;
    expect(anatomy.data).toMatchObject({ semester: null, units: 3, level: 200, curriculumSource: "BU Bulletin 2023-2027" });
    expect(validated.find((row) => row.data?.code === "BU-GST 011")!.data).toMatchObject({ units: 0, semester: 1 });
  });
});

describe("B6 default owners", () => {
  it("fills a default owner only where a row has none, and notes it", () => {
    const { rows, notes } = applyOwnerDefaults([
      { "Course Code": "BU-GEG 403", Ownership: "DEPARTMENT", "Owner Department Code": "", "Owner School Code": "" },
      { "Course Code": "STA 111", Ownership: "DEPARTMENT", "Owner Department Code": "" },
      { "Course Code": "BU-GEG 405", Ownership: "DEPARTMENT", "Owner Department Code": "SOEN-CVE" },
      { "Course Code": "BU-ACC 101", Ownership: "DEPARTMENT", "Owner Department Code": "" },
    ]);
    expect(rows[0]).toMatchObject({ Ownership: "SCHOOL", "Owner School Code": "SOEN" });
    expect(rows[1]).toMatchObject({ Ownership: "DEPARTMENT", "Owner Department Code": "SSAT-BAS" });
    expect(rows[2]).toMatchObject({ "Owner Department Code": "SOEN-CVE" });
    expect(rows[3]).toMatchObject({ "Owner Department Code": "" });
    expect(notes.map((note) => note.code)).toEqual(["BU-GEG 403", "STA 111"]);
    expect(notes[0].note).toContain("School of Engineering (SOEN)");
  });
});

describe("semesters and titles", () => {
  const converted = convertHeldBackRows(sheet, programmes);
  const semesterOf = (code: string) => converted.rows.find((row) => row["Course Code"] === code)?.Semester;

  it("keeps MBBS courses sessional and gives other courses the semester their number implies (W10)", () => {
    expect(semesterOf("ANAT 223")).toBe("");
    expect(semesterOf("IRM 107")).toBe("1");
    expect(semesterOf("IRM 204")).toBe("2");
    expect(converted.notes.find((note) => note.code === "IRM 107")?.note).toContain("from the course number (W10)");
  });

  it("tells the same course from a different one under the same code", () => {
    expect(sameCourseTitle("General Physics I (Mechanics)", "General Physics I")).toBe(true);
    expect(sameCourseTitle("Biostastics", "Biostastics")).toBe(true);
    expect(sameCourseTitle("Neonatology and Genetics", "Paediatrics Oncology")).toBe(false);
    expect(sameCourseTitle("Research Methods in Entrepreneurship", "Venture Creation")).toBe(false);
  });
});
