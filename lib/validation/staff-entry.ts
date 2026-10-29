export type StaffEntryRow = {
  title?: string;
  gender?: string;
  surname?: string;
  firstName?: string;
  highestQualification?: string;
  academicRank?: string;
  email?: string;
  type?: string;
};

export type StaffEntryValidationError = {
  rowIndex: number;
  message: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStaffEntryRows(
  rows: StaffEntryRow[],
): StaffEntryValidationError[] {
  const errors: StaffEntryValidationError[] = [];

  rows.forEach((row, rowIndex) => {
    const missing: string[] = [];
    if (!row.title?.trim()) missing.push("title");
    if (!row.surname?.trim()) missing.push("surname");
    if (!row.firstName?.trim()) missing.push("first name");
    if (!row.gender?.trim()) missing.push("gender");
    if (!row.highestQualification?.trim()) missing.push("highest qualification");
    if (!row.academicRank?.trim()) {
      missing.push(row.type === "NON_ACADEMIC" ? "job title" : "academic rank");
    }

    if (missing.length > 0) {
      errors.push({
        rowIndex,
        message: `Row ${rowIndex + 1}: complete ${missing.join(", ")}.`,
      });
    }
    if (row.email?.trim() && !EMAIL_PATTERN.test(row.email.trim())) {
      errors.push({
        rowIndex,
        message: `Row ${rowIndex + 1}: enter a valid email address.`,
      });
    }
  });

  return errors;
}
