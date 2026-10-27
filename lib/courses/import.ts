export interface ImportableDescription {
  learningOutcomes?: string[];
  courseContent?: string;
  labWork?: string;
  entrepreneurialAspect?: string;
}

export interface ImportableCourse {
  code: string;
  title: string;
  units: number;
  semester: number;
  level: number;
  status?: "CORE" | "ELECTIVE";
  type?: string;
  prerequisites?: string;
  id?: string;
  description?: string | ImportableDescription;
}

export interface ImportedCourseDraft {
  [key: string]: unknown;
  code: string;
  title: string;
  units: number;
  status: "CORE" | "ELECTIVE";
  semester: number;
  level: number;
  prerequisites: string;
  masterCourseId?: string;
  importedDescription?: ImportableDescription;
  isNew: true;
}

export function courseFromRegistry(
  course: ImportableCourse,
): ImportedCourseDraft {
  return {
    code: course.code,
    title: course.title,
    units: course.units,
    status: course.type === "ELECTIVE" ? "ELECTIVE" : "CORE",
    semester: course.semester,
    level: course.level,
    prerequisites: course.prerequisites || "",
    masterCourseId: course.id,
    importedDescription:
      typeof course.description === "string" && course.description
        ? { courseContent: course.description }
        : typeof course.description === "object"
          ? course.description
          : undefined,
    isNew: true,
  };
}

export function courseFromPreviousBulletin(
  course: ImportableCourse,
): ImportedCourseDraft {
  return {
    code: course.code,
    title: course.title,
    units: course.units,
    status: course.status || "CORE",
    semester: course.semester,
    level: course.level,
    prerequisites: course.prerequisites || "",
    importedDescription:
      typeof course.description === "object" ? course.description : undefined,
    isNew: true,
  };
}
