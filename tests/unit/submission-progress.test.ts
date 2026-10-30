import { describe, expect, it } from "vitest";
import { calculateSubmissionProgress } from "@/lib/submissions/progress";

describe("submission content progress", () => {
  it("reports an untouched draft as zero progress", () => {
    expect(
      calculateSubmissionProgress({
        content: null,
        activeStaffCount: 0,
        courses: [],
      }),
    ).toMatchObject({
      percentage: 0,
      completedSections: 0,
      totalSections: 8,
    });
  });

  it("measures completed and partially completed bulletin sections", () => {
    const progress = calculateSubmissionProgress({
      content: {
        programmeInfo: {
          deanImageUrl: "https://example.edu/dean.jpg",
          hodImageUrl: "https://example.edu/hod.jpg",
        },
        philosophy: "A complete programme philosophy.",
        mission: "A clear mission.",
        vision: "A clear vision.",
        objectives: ["Develop capable graduates"],
        uniqueFeatures: ["Practice-led teaching"],
        employability: ["Legal practice"],
        utmeRequirements: "Five credits.",
        directEntryRequirements: "Direct entry requirements.",
        transferRequirements: "Transfer requirements.",
        minimumDuration: "5 years",
        graduationRequirements: "Complete all required courses.",
        minimumCGPA: 2.5,
        totalUnits: 154,
        sectionF: { content: "Programme regulations." },
        sectionG: { content: "" },
      },
      activeStaffCount: 4,
      courses: [
        {
          description: {
            courseContent: "Complete course content.",
            learningOutcomes: ["Explain the relevant concepts"],
          },
        },
        { description: { courseContent: "", learningOutcomes: [] } },
      ],
    });

    expect(progress).toMatchObject({
      percentage: 88,
      completedSections: 6,
      totalSections: 8,
    });
    expect(progress.sections.find((item) => item.key === "descriptions")).toMatchObject({
      percentage: 50,
      complete: false,
    });
    expect(progress.sections.find((item) => item.key === "regulations")).toMatchObject({
      percentage: 50,
      complete: false,
    });
  });
});
