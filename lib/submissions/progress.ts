import { cleanText } from "@/lib/bulletin/document-utils";

export interface SubmissionProgressSection {
  key: string;
  label: string;
  percentage: number;
  complete: boolean;
}

export interface SubmissionProgress {
  percentage: number;
  completedSections: number;
  totalSections: number;
  sections: SubmissionProgressSection[];
}

interface SubmissionProgressContent {
  programmeInfo?: unknown;
  philosophy?: string | null;
  mission?: string | null;
  vision?: string | null;
  objectives?: unknown;
  uniqueFeatures?: unknown;
  employability?: unknown;
  utmeRequirements?: string | null;
  directEntryRequirements?: string | null;
  transferRequirements?: string | null;
  minimumDuration?: string | null;
  graduationRequirements?: string | null;
  minimumCGPA?: number | null;
  totalUnits?: number | null;
  sectionF?: unknown;
  sectionG?: unknown;
}

interface CourseProgressData {
  description?: {
    courseContent?: string | null;
    learningOutcomes?: unknown;
  } | null;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && cleanText(value).length > 0;
}

function hasListValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasText);
  return hasText(value);
}

function jsonField(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

function section(
  key: string,
  label: string,
  checks: boolean[],
): SubmissionProgressSection {
  const passed = checks.filter(Boolean).length;
  const percentage = checks.length === 0 ? 0 : Math.round((passed / checks.length) * 100);
  return { key, label, percentage, complete: percentage === 100 };
}

export function calculateSubmissionProgress({
  content,
  activeStaffCount,
  courses,
}: {
  content?: SubmissionProgressContent | null;
  activeStaffCount: number;
  courses: CourseProgressData[];
}): SubmissionProgress {
  const programmeInfo = content?.programmeInfo;
  const completeCourseDescriptions = courses.filter((course) => {
    const description = course.description;
    return (
      hasText(description?.courseContent) &&
      hasListValue(description?.learningOutcomes)
    );
  }).length;

  const sections = [
    section("deans_hods", "Deans & HODs", [
      hasText(jsonField(programmeInfo, "deanImageUrl")),
      hasText(jsonField(programmeInfo, "hodImageUrl")),
    ]),
    section("staff", "Staff Directory", [activeStaffCount > 0]),
    section("overview", "Programme Overview", [
      hasText(content?.philosophy),
      hasText(content?.mission),
      hasText(content?.vision),
      hasListValue(content?.objectives),
      hasListValue(content?.uniqueFeatures),
      hasListValue(content?.employability),
    ]),
    section("admission", "Admission Requirements", [
      hasText(content?.utmeRequirements),
      hasText(content?.directEntryRequirements),
      hasText(content?.transferRequirements),
      hasText(content?.minimumDuration),
    ]),
    section("graduation", "Graduation Requirements", [
      hasText(content?.graduationRequirements),
      typeof content?.minimumCGPA === "number" && content.minimumCGPA > 0,
      typeof content?.totalUnits === "number" && content.totalUnits > 0,
    ]),
    section("courses", "Course Structure", [courses.length > 0]),
    section(
      "descriptions",
      "Course Details",
      courses.length > 0
        ? courses.map((_, index) => index < completeCourseDescriptions)
        : [false],
    ),
    section("regulations", "Regulations & Changes", [
      hasText(jsonField(content?.sectionF, "content")),
      hasText(jsonField(content?.sectionG, "content")),
    ]),
  ];

  const percentage = Math.round(
    sections.reduce((total, item) => total + item.percentage, 0) /
      sections.length,
  );

  return {
    percentage,
    completedSections: sections.filter((item) => item.complete).length,
    totalSections: sections.length,
    sections,
  };
}
