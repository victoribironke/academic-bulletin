import { describe, expect, it } from "vitest";
import {
  descriptionAccess,
  isOwnedElsewhere,
  ownerName,
  ownsCourse,
  sharedCourseLockedMessage,
} from "@/lib/courses/shared-courses";
import { calculateSubmissionProgress } from "@/lib/submissions/progress";

// Rule W16: who writes a shared course's description, worked out without a database.

const place = { departmentId: "d-eco", schoolId: "s-vass" };
const owned = (ownerDeptId: string | null, ownerSchoolId: string | null = null, extra: Partial<{ type: string; ownership: string }> = {}) => ({
  type: "CORE",
  ownership: ownerDeptId ? "DEPARTMENT" : ownerSchoolId ? "SCHOOL" : "INSTITUTIONAL",
  ownerDeptId,
  ownerSchoolId,
  ownerDepartment: ownerDeptId ? { name: "Basic and Applied Sciences" } : null,
  ownerSchool: ownerSchoolId ? { name: "School of Science and Technology" } : null,
  ...extra,
});

describe("ownsCourse", () => {
  it("goes by the owning department, then the owning school", () => {
    expect(ownsCourse(owned("d-eco"), place)).toBe(true);
    expect(ownsCourse(owned("d-bas"), place)).toBe(false);
    expect(ownsCourse(owned(null, "s-vass"), place)).toBe(true);
    expect(ownsCourse(owned(null, "s-sat"), place)).toBe(false);
    expect(ownsCourse(owned(null), place)).toBeNull();
  });
});

describe("descriptionAccess", () => {
  it("lets the owner write for every programme and locks it for the others", () => {
    expect(descriptionAccess({ code: "ECO 101", masterCourse: owned("d-eco") }, place)).toBe("OWNER");
    expect(descriptionAccess({ code: "MTH 101", masterCourse: owned("d-bas") }, place)).toBe("LOCKED");
    expect(descriptionAccess({ code: "SSC 201", masterCourse: owned(null, "s-vass") }, place)).toBe("OWNER");
    expect(descriptionAccess({ code: "STA 101", masterCourse: owned(null, "s-sat") }, place)).toBe("LOCKED");
  });

  it("keeps a programme's own row, and a course nobody owns yet, in the draft", () => {
    expect(descriptionAccess({ code: "ECO 499", masterCourse: null }, place)).toBe("LOCAL");
    expect(descriptionAccess({ code: "ECO 498", masterCourse: owned(null) }, place)).toBe("LOCAL");
  });

  it("locks General Education for every department but its host (W1)", () => {
    const general = owned(null, null, { type: "GST_BU" });
    expect(descriptionAccess({ code: "BU-GST 105", masterCourse: general }, place)).toBe("LOCKED");
    expect(descriptionAccess({ code: "GST 111", masterCourse: null }, place)).toBe("LOCKED");
    const hosted = owned("d-eco", null, { type: "GST_BU", ownership: "INSTITUTIONAL" });
    expect(descriptionAccess({ code: "BU-GST 105", masterCourse: hosted }, place)).toBe("OWNER");
  });

  it("lets DAP's administrators write any row", () => {
    expect(descriptionAccess({ code: "MTH 101", masterCourse: owned("d-bas") }, place, { isAdministrator: true })).toBe("OWNER");
    expect(descriptionAccess({ code: "ECO 499", masterCourse: null }, place, { isAdministrator: true })).toBe("LOCAL");
  });
});

describe("what the Head of Department is told", () => {
  it("names the owner", () => {
    expect(ownerName(owned("d-bas"))).toBe("Basic and Applied Sciences");
    expect(ownerName(owned(null, "s-sat"))).toBe("School of Science and Technology");
    expect(sharedCourseLockedMessage(owned("d-bas"), "MTH 101")).toContain("MTH 101 is taught by Basic and Applied Sciences");
    expect(sharedCourseLockedMessage(owned(null, null, { type: "GST_BU" }), "BU-GST 105")).toContain("General Education desk");
  });
});

describe("honest progress with shared courses (G5 with W16)", () => {
  it("leaves out a course another department writes", () => {
    const complete = { courseContent: "Content.", learningOutcomes: ["Explain it"], graceStatus: "PASSED" };
    const progress = calculateSubmissionProgress({
      content: null,
      activeStaffCount: 0,
      courses: [
        { description: complete },
        { ownedElsewhere: isOwnedElsewhere({ code: "MTH 101", masterCourse: owned("d-bas") }, place), description: null },
      ],
    });
    expect(progress.sections.find((section) => section.key === "descriptions")?.percentage).toBe(100);
  });
});
