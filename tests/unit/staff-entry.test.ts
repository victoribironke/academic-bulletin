import { describe, expect, it } from "vitest";
import { validateStaffEntryRows } from "@/lib/validation/staff-entry";

const valid = {
  title: "DR",
  gender: "FEMALE",
  surname: "Example",
  firstName: "Ada",
  highestQualification: "PHD",
  academicRank: "LECTURER_I",
  email: "ada@example.edu",
  type: "ACADEMIC",
};

describe("manual staff entry validation", () => {
  it("accepts a complete staff row", () => {
    expect(validateStaffEntryRows([valid])).toEqual([]);
  });

  it("does not silently accept an empty or partially completed row", () => {
    const errors = validateStaffEntryRows([{ surname: "Example", type: "ACADEMIC" }]);
    expect(errors[0].message).toContain("title");
    expect(errors[0].message).toContain("first name");
  });

  it("validates optional email addresses when supplied", () => {
    expect(validateStaffEntryRows([{ ...valid, email: "not-an-email" }])).toEqual([
      { rowIndex: 0, message: "Row 1: enter a valid email address." },
    ]);
  });
});
