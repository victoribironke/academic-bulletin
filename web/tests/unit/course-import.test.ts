import { describe, expect, it } from "vitest";
import {
  courseFromPreviousBulletin,
  courseFromRegistry,
} from "@/lib/courses/import";

describe("course imports", () => {
  it("preserves all details from a previous bulletin", () => {
    const imported = courseFromPreviousBulletin({
      code: "CSC 201",
      title: "Data Structures",
      units: 3,
      semester: 1,
      level: 200,
      status: "CORE",
      prerequisites: "CSC 101",
      description: {
        learningOutcomes: ["Select appropriate data structures"],
        courseContent: "Lists, trees, graphs, and hashing.",
        labWork: "Implementation exercises",
        entrepreneurialAspect: "Building reusable software components",
      },
    });

    expect(imported.importedDescription).toEqual({
      learningOutcomes: ["Select appropriate data structures"],
      courseContent: "Lists, trees, graphs, and hashing.",
      labWork: "Implementation exercises",
      entrepreneurialAspect: "Building reusable software components",
    });
  });

  it("maps a university-wide registry description into course content", () => {
    const imported = courseFromRegistry({
      id: "registry-course",
      code: "GST 101",
      title: "Use of English",
      units: 2,
      semester: 1,
      level: 100,
      type: "GST_NUC",
      description: "University-wide communication course.",
    });

    expect(imported.masterCourseId).toBe("registry-course");
    expect(imported.status).toBe("CORE");
    expect(imported.importedDescription?.courseContent).toBe(
      "University-wide communication course.",
    );
  });
});
