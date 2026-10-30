import { Blob, File } from "node:buffer";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  validateCourseImportRows,
  validateMasterCourseImportRows,
} from "@/lib/imports/courses";
import {
  STAFF_TEMPLATE_COLUMNS,
  STAFF_TEMPLATE_EXAMPLES,
  staffDuplicateKey,
  validateStaffImportRows,
} from "@/lib/imports/staff";
import {
  createExcelTemplateBuffer,
  parseSpreadsheetFile,
} from "@/lib/imports/spreadsheet";

describe("spreadsheet file parsing", () => {
  it("creates a blank Excel upload sheet and keeps examples separate", async () => {
    const buffer = await createExcelTemplateBuffer(
      STAFF_TEMPLATE_COLUMNS,
      STAFF_TEMPLATE_EXAMPLES,
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Upload",
      "Instructions",
      "Examples",
    ]);
    expect(workbook.getWorksheet("Upload")?.getRow(1).values).toEqual([
      ,
      ...STAFF_TEMPLATE_COLUMNS.map((column) => column.label),
    ]);
    expect(workbook.getWorksheet("Upload")?.getCell("A2").value).toBeNull();
    expect(workbook.getWorksheet("Upload")?.getCell("A2").dataValidation.type).toBe("list");
    expect(workbook.getWorksheet("Examples")?.getCell("A2").value).toBe("ACADEMIC");

    const bytes = Uint8Array.from(buffer as unknown as ArrayLike<number>);
    const file = new File([new Blob([bytes])], "staff-template.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await expect(parseSpreadsheetFile(file as unknown as globalThis.File)).resolves.toEqual([]);
  });

  it("reads an Excel workbook into import records", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Courses");
    sheet.addRow(["Course Code", "Course Title", "Units"]);
    sheet.addRow(["COS 101", "Introduction to Computing", 3]);
    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = Uint8Array.from(buffer as unknown as ArrayLike<number>);
    const file = new File([new Blob([bytes])], "courses.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await expect(parseSpreadsheetFile(file as unknown as globalThis.File)).resolves.toEqual([
      {
        "Course Code": "COS 101",
        "Course Title": "Introduction to Computing",
        Units: "3",
      },
    ]);
  });
});

describe("bulk staff import validation", () => {
  it("accepts a newly filled staff Excel template with ordinary display labels", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Staff Upload");
    sheet.addRow([
      "Staff Type",
      "Title",
      "Surname",
      "First Name",
      "Middle Name",
      "Gender",
      "Highest Qualification",
      "Academic Rank / Job Title",
      "Custom Job Title",
      "Specialization",
      "Email",
    ]);
    sheet.addRow([
      "Academic Staff",
      "Professor",
      "Ibironke",
      "Victor",
      "",
      "Male",
      "LL.B, BL, LL.M, Ph.D.",
      "Lecturer I",
      "",
      "Commercial Law",
      "victor.ibironke@example.edu",
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = Uint8Array.from(buffer as unknown as ArrayLike<number>);
    const file = new File([new Blob([bytes])], "staff-upload.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const records = await parseSpreadsheetFile(file as unknown as globalThis.File);
    const [row] = validateStaffImportRows(records);

    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({
      type: "ACADEMIC",
      title: "PROF",
      highestQualification: "PHD",
      academicRank: "LECTURER_I",
    });
  });

  it("accepts common labels for adjunct academic staff", () => {
    const [row] = validateStaffImportRows([
      {
        "Staff Type": "Adjunct Academic Staff",
        Title: "Prof.",
        Surname: "Adebayo",
        "First Name": "Tunde",
        Gender: "Male",
        "Highest Qualification": "PhD",
        "Academic Rank / Job Title": "Professor",
        Email: "tunde.adebayo@example.edu",
      },
    ]);

    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({
      type: "ADJUNCT",
      title: "PROF",
      academicRank: "PROFESSOR",
    });
  });

  it("normalizes a non-academic job title into the supported data model", () => {
    const [row] = validateStaffImportRows([
      {
        "Staff Type": "Non Academic",
        Title: "Mrs.",
        Surname: "Adeyemi",
        "First Name": "Bola",
        Gender: "Female",
        "Highest Qualification": "Bachelor's Degree",
        "Academic Rank / Job Title": "Laboratory Technologist",
        Email: "BOLA.ADEYEMI@example.edu",
      },
    ]);

    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({
      type: "NON_ACADEMIC",
      title: "MRS",
      gender: "FEMALE",
      highestQualification: "BACHELOR",
      academicRank: "OTHER",
      customJobTitle: "Laboratory Technologist",
      email: "bola.adeyemi@example.edu",
    });
  });

  it("rejects duplicates already present in the department", () => {
    const existing = staffDuplicateKey({
      email: "duplicate@example.edu",
      surname: "One",
      firstName: "Person",
    });
    const [row] = validateStaffImportRows(
      [
        {
          "Staff Type": "ACADEMIC",
          Title: "DR",
          Surname: "One",
          "First Name": "Person",
          Gender: "MALE",
          "Highest Qualification": "PHD",
          "Academic Rank / Job Title": "LECTURER_I",
          Email: "duplicate@example.edu",
        },
      ],
      [existing],
    );

    expect(row.errors).toContain(
      "This staff member is duplicated or already exists.",
    );
  });
});

describe("bulk course import validation", () => {
  it("preserves detailed course content and splits learning outcomes", () => {
    const [row] = validateCourseImportRows([
      {
        "Course Code": "cos101",
        "Course Title": "Introduction to Computing",
        Units: "3",
        Status: "Core",
        Semester: "1",
        Level: "100",
        "Learning Outcomes": "Explain computer systems | Build a small program",
        "Course Content": "Computing fundamentals",
        "Laboratory Work": "Programming exercises",
        "Entrepreneurial Aspect": "Prototype a software product",
      },
    ]);

    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({
      code: "COS 101",
      status: "CORE",
      learningOutcomes: [
        "Explain computer systems",
        "Build a small program",
      ],
      labWork: "Programming exercises",
      entrepreneurialAspect: "Prototype a software product",
    });
  });

  it("rejects duplicate codes and levels outside the programme", () => {
    const [row] = validateCourseImportRows(
      [
        {
          "Course Code": "COS 101",
          "Course Title": "Another Introduction",
          Units: 3,
          Semester: 1,
          Level: 500,
        },
      ],
      { allowedLevels: [100, 200, 300, 400], existingCodes: ["COS 101"] },
    );

    expect(row.errors).toEqual(
      expect.arrayContaining([
        "Course Code is duplicated or already exists.",
        "Level must be one of: 100, 200, 300, 400.",
      ]),
    );
  });
});

describe("Registry bulk import validation", () => {
  it("requires GST courses to be university-wide", () => {
    const [row] = validateMasterCourseImportRows([
      {
        "Course Code": "GST 102",
        "Course Title": "Nigerian Peoples and Culture",
        Units: 2,
        "Course Type": "GST_NUC",
        Ownership: "DEPARTMENT",
        Level: 100,
        Semester: 2,
        "Owner Department Code": "TDA",
      },
    ]);

    expect(row.errors).toContain(
      "GST courses must use INSTITUTIONAL ownership.",
    );
  });
});
