import type { BulletinData, BulletinProgramme } from "./generation";
import { cleanText, programmeCourseUnits } from "./document-utils";

export type BulletinValidationIssue = {
  code: string;
  message: string;
  programmeId: string;
  programmeName: string;
  severity: "error" | "warning";
};

function issue(
  programme: BulletinProgramme,
  code: string,
  message: string,
  severity: BulletinValidationIssue["severity"] = "error",
): BulletinValidationIssue {
  return {
    code,
    message,
    programmeId: programme.id,
    programmeName: programme.name,
    severity,
  };
}

export function validateBulletinProgramme(
  programme: BulletinProgramme,
): BulletinValidationIssue[] {
  const issues: BulletinValidationIssue[] = [];
  const content = programme.content;
  const actualUnits = programmeCourseUnits(programme);

  if (programme.staff.length === 0) {
    issues.push(
      issue(programme, "NO_STAFF", "No staff members have been added."),
    );
  }
  if (programme.courses.length === 0) {
    issues.push(
      issue(programme, "NO_COURSES", "No courses have been added."),
    );
  }
  if (
    content?.totalUnits &&
    actualUnits !== content.totalUnits
  ) {
    issues.push(
      issue(
        programme,
        "UNIT_TOTAL_MISMATCH",
        `The course structure contains ${actualUnits} units, but the programme states ${content.totalUnits} expected units.`,
      ),
    );
  }

  const incompleteCourses = programme.courses.filter((course) => {
    const description = course.description;
    return (
      !description ||
      !cleanText(description.courseContent) ||
      !description.learningOutcomes?.some((outcome) => cleanText(outcome))
    );
  });
  if (incompleteCourses.length > 0) {
    const preview = incompleteCourses
      .slice(0, 5)
      .map((course) => course.code)
      .join(", ");
    const remainder = incompleteCourses.length > 5
      ? ` and ${incompleteCourses.length - 5} more`
      : "";
    issues.push(
      issue(
        programme,
        "INCOMPLETE_COURSE_DETAILS",
        `Learning outcomes and course content are incomplete for ${preview}${remainder}.`,
      ),
    );
  }

  const requiredContent: Array<[keyof NonNullable<BulletinProgramme["content"]>, string]> = [
    ["philosophy", "programme philosophy"],
    ["mission", "mission"],
    ["vision", "vision"],
    ["utmeRequirements", "UTME requirements"],
    ["graduationRequirements", "graduation requirements"],
  ];
  for (const [key, label] of requiredContent) {
    const value = content?.[key];
    if (typeof value !== "string" || !cleanText(value)) {
      issues.push(
        issue(programme, `MISSING_${String(key).toUpperCase()}`, `The ${label} section is empty.`),
      );
    }
  }

  return issues;
}

export function validateBulletinData(data: BulletinData): BulletinValidationIssue[] {
  return data.programmes.flatMap(validateBulletinProgramme);
}

export function blockingBulletinIssues(data: BulletinData): BulletinValidationIssue[] {
  return validateBulletinData(data).filter((item) => item.severity === "error");
}
