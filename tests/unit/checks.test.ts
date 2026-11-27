import { describe, expect, it } from "vitest";
import { type DraftCourse, type DraftData, POLICY, creditNumbers, runRules } from "@/lib/checks/rules";
import { GENERAL_EDUCATION_BLOCK } from "@/lib/courses/general-education";

// Task F1: the checks of Appendix A, run on one draft.

const course = (code: string, level: number, semester: number | null, units = 3, extra: Partial<DraftCourse> = {}): DraftCourse => ({
  code,
  title: `Course ${code}`,
  units,
  level,
  semester,
  status: "CORE",
  inRegistry: true,
  generalEducation: false,
  owned: true,
  description: { learningOutcomes: ["Explain one", "Describe two", "Apply three"], courseContent: `Content of ${code}.` },
  ...extra,
});

const block = GENERAL_EDUCATION_BLOCK.filter((item) => item.level <= 400).map((item) =>
  course(item.code, item.level, item.semester, item.units, { generalEducation: true, title: item.title }),
);

function draft(over: Partial<DraftData> = {}): DraftData {
  const own: DraftCourse[] = [];
  for (const level of [100, 200, 300, 400]) {
    for (const semester of [1, 2]) {
      for (let i = 0; i < 5; i += 1) own.push(course(`ECO ${level / 100}${i}${semester === 1 ? 1 : 2}`, level, semester));
    }
  }
  own.push(course("ECO 490", 400, null, 6, { title: "Research Project" }));
  return {
    submissionId: "d1",
    phase: 1,
    programme: { code: "VSSS-ECO-ECO", name: "Economics", duration: 4, isNew: false },
    content: {
      programmeInfo: { deanImageUrl: "/api/files/d.jpg", hodImageUrl: "/api/files/h.jpg" },
      minimumCGPA: 2,
      sectionG: { content: `<p>${"word ".repeat(60)}</p>` },
    },
    courses: [...block, ...own],
    staff: [{ type: "ACADEMIC", academicRank: "LECTURER_I", highestQualification: "PHD", customJobTitle: null }],
    openComments: [],
    courseListConfirmed: true,
    graceBlocked: [],
    ...over,
  };
}

const rules = (data: DraftData) => runRules(data).map((finding) => `${finding.rule}:${finding.level}`);

describe("the rules engine (F1)", () => {
  it("finds nothing wrong with a complete draft", () => {
    expect(runRules(draft())).toEqual([]);
  });

  it("refuses a draft like the November test Economics record: 12 of 154 units, empty levels", () => {
    const data = draft({
      courses: [course("ECO 101", 100, 1, 3), course("ECO 102", 100, 2, 3), course("ECO 201", 200, 1, 3), course("ECO 202", 200, 2, 3)],
      content: { minimumCGPA: 2, totalUnits: 154 },
    });
    const found = runRules(data);
    expect(found.filter((finding) => finding.level === "MUST").map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(["V1", "V2", "V5", "V6"]),
    );
    expect(found.find((finding) => finding.rule === "V1")?.message).toBe("The Course Structure adds up to 12 units, but the programme's total says 154.");
    expect(found.some((finding) => finding.key === "V2:300")).toBe(true);
  });

  it("asks to check a semester outside 16 to 24 credits, except placements and DAP's exceptions", () => {
    const light = draft();
    light.courses = light.courses.filter((item) => !(item.level === 300 && item.semester === 2 && item.code.startsWith("ECO 3") && item.code !== "ECO 302"));
    const found = runRules(light).filter((finding) => finding.rule === "V3");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "CHECK", key: expect.stringMatching(/^V3:300:2:/) });
    expect(runRules({ ...light, approvedLoadExceptions: [{ level: 300, semester: 2 }] }).some((finding) => finding.rule === "V3")).toBe(false);
    const siwes = { ...light, courses: [...light.courses, course("ECO 399", 300, 2, 0, { title: "SIWES" })] };
    expect(runRules(siwes).some((finding) => finding.rule === "V3")).toBe(false);
  });

  it("checks the graduation numbers against the Course Structure (V4)", () => {
    const data = draft();
    const total = creditNumbers(data.courses).total;
    expect(runRules({ ...data, content: { ...data.content, graduationRequirements: `A minimum of ${total} credits is required.` } }).some((finding) => finding.rule === "V4")).toBe(false);
    expect(rules({ ...data, content: { ...data.content, graduationRequirements: "A minimum of 152 credits is required." } })).toContain("V4:MUST");
  });

  it("counts open comments, unconfirmed lists, unknown codes, staff and levels beyond the length", () => {
    const data = draft({
      openComments: [{ section: "overview" }, { section: "overview" }],
      courseListConfirmed: false,
      staff: [],
      courses: [...draft().courses, course("ECO 501", 500, 1, 3), course("XYZ 999", 400, 1, 3, { inRegistry: false })],
    });
    expect(rules(data)).toEqual(expect.arrayContaining(["V13:MUST", "V17:MUST", "V19:MUST", "V21:MUST", "V16:MUST"]));
    expect(runRules(data).find((finding) => finding.rule === "V13")?.message).toBe("2 open comments to answer and resolve.");
  });

  it("asks to check course numbers, the final project and a CGPA above 2.00", () => {
    const data = draft();
    data.courses = data.courses.filter((item) => item.code !== "ECO 490");
    data.courses.push(course("ECO 305", 200, 1, 3));
    data.content = { ...data.content, minimumCGPA: 2.5 };
    const found = runRules(data);
    expect(found.find((finding) => finding.rule === "V22")?.items).toEqual(["ECO 305"]);
    expect(rules(data)).toEqual(expect.arrayContaining(["V24:CHECK", "V26:CHECK"]));
    expect(rules({ ...data, content: { ...data.content, minimumCGPA: 5.5 } })).toContain("V26:MUST");
  });

  it("asks to check units that don't match the contact hours, but not for projects (V23, W2)", () => {
    const data = draft();
    data.courses = data.courses.map((item) =>
      item.code === "ECO 101" ? { ...item, lectureHours: 30, practicalHours: 0 } : item.code === "ECO 111" ? { ...item, lectureHours: 45, practicalHours: 0 } : item.code === "ECO 490" ? { ...item, lectureHours: 0, practicalHours: 0 } : item,
    );
    const found = runRules(data).filter((finding) => finding.rule === "V23");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ level: "CHECK", items: ["ECO 101"] });
    expect(found[0].message).toContain("ECO 101 (3 units; 30 lecture and 0 practical hours give 2)");
  });

  it("needs each elective group to say how many units a student chooses, and to offer that many (V25, W3)", () => {
    const data = draft();
    data.courses = data.courses.map((item) => (item.code === "ECO 401" || item.code === "ECO 411" ? { ...item, status: "ELECTIVE", electiveGroupId: "g1" } : item));
    expect(runRules({ ...data, electiveGroups: [{ id: "g1", name: "400 options", chooseUnits: 3 }] }).filter((finding) => finding.rule === "V25")).toEqual([]);
    expect(rules({ ...data, electiveGroups: [{ id: "g1", name: "400 options", chooseUnits: 9 }] })).toContain("V25:MUST");
    expect(rules({ ...data, electiveGroups: [{ id: "g1", name: "400 options", chooseUnits: 3 }, { id: "g2", name: "Empty", chooseUnits: 3 }] })).toContain("V25:MUST");
    // Electives outside any group: a "Please check", and they count in full.
    const loose = runRules({ ...data, electiveGroups: [] }).find((finding) => finding.rule === "V25");
    expect(loose).toMatchObject({ level: "CHECK", items: ["ECO 401", "ECO 411"] });
  });

  it("asks for the Dean's and Head's title, name and photo from the records (V6, E4)", () => {
    const leaders = {
      dean: { title: "Prof.", name: "Ada Dean", imageUrl: "/api/files/d.jpg" },
      hod: { title: null, name: null, imageUrl: "/api/files/h.jpg" },
    };
    expect(runRules(draft({ leaders })).find((finding) => finding.rule === "V6")?.message).toBe("Add the Head of Department's title and name.");
    expect(runRules(draft({ leaders: { ...leaders, hod: { title: "Dr.", name: "Bo Head", imageUrl: "/api/files/h.jpg" } } })).some((finding) => finding.rule === "V6")).toBe(false);
  });

  it("carries DAP's 38 approved semester loads from package file 03 (W9, F6)", () => {
    expect(POLICY.approvedLoadExceptions).toHaveLength(38);
    for (const item of POLICY.approvedLoadExceptions) {
      expect(item.programme.trim()).not.toBe("");
      expect([1, 2]).toContain(item.semester);
      expect(item.level % 100).toBe(0);
    }
    expect(POLICY.approvedLoadExceptions).toContainEqual(expect.objectContaining({ programme: "Chemistry", level: 400, semester: 2 }));
  });

  it("works out the credit numbers the app writes (W4, W5)", () => {
    const numbers = creditNumbers([
      course("GST 111", 100, 1, 2, { generalEducation: true }),
      course("ECO 101", 100, 1, 3),
      course("ACC 101", 100, 1, 3, { owned: false }),
    ]);
    expect(numbers).toEqual({ generalEducation: 2, departmental: 3, outside: 3, total: 8 });
  });
});
