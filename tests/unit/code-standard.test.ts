import { describe, expect, it } from "vitest";
import {
  type CodeStandard,
  type PlatformSnapshot,
  officialProgrammeName,
  planCodeStandard,
  planHasChanges,
  splitOfficialName,
} from "@/lib/units/code-standard";
import { buildCodeLookup } from "@/lib/units/code-aliases";

// Task A5 (with B15 and B18): the code and name standard of November 23, 2026.

const standard: CodeStandard = {
  schools: [
    { oldCode: "SEH", code: "JSEH", name: "Joel Awoniyi School of Education and Humanities", reserved: false },
    { oldCode: "SOC", code: "SOCO", name: "School of Computing", reserved: false },
    { oldCode: "SAHS", code: "SAHS", name: "School of Allied Health Sciences", reserved: false },
    { oldCode: null, code: "SBCS", name: "School of Basic Clinical Sciences", reserved: true },
  ],
  departments: [
    { oldCode: "EDU", code: "JSEH-EDU", schoolCode: "JSEH", name: "Department of Education" },
    { oldCode: "REL", code: "JSEH-REL", schoolCode: "JSEH", name: "Department of Religious Studies", nameToConfirm: true },
    { oldCode: "COS", code: "SOCO-COS", schoolCode: "SOCO", name: "Department of Computer Science" },
    { oldCode: "IFT", code: "SOCO-IFT", schoolCode: "SOCO", name: "Department of Information Technology" },
    { oldCode: "HND", code: "SAHS-NUT", schoolCode: "SAHS", name: "Department of Human Nutrition and Dietetics" },
  ],
  programmes: [
    { oldCode: "SEH-EDU-GNC", code: "JSEH-EDU-GNC", departmentCode: "JSEH-EDU", officialName: "B.Sc.Ed. (Hons.) Guidance and Counselling", isNewProgramme: false },
    { oldCode: "SOC-IFT-IFS", code: "SOCO-COS-IFS", departmentCode: "SOCO-COS", officialName: "B.Sc. (Hons.) Information Systems", isNewProgramme: false },
    { oldCode: "SOC-COS-CYS", code: "SOCO-IFT-CYS", departmentCode: "SOCO-IFT", officialName: "B.Sc. (Hons.) Cybersecurity", isNewProgramme: false },
    { oldCode: "SAHS-HND-HND", code: "SAHS-NUT-NUT", departmentCode: "SAHS-NUT", officialName: "B.Sc. (Hons.) Human Nutrition and Dietetics", isNewProgramme: false },
    { oldCode: null, code: "SOCO-COS-AIN", departmentCode: "SOCO-COS", officialName: "B.Sc. (Hons.) Artificial Intelligence", isNewProgramme: true },
    { oldCode: null, code: "JSEH-REL-CRS", departmentCode: "JSEH-REL", officialName: "B.A. (Hons.) Christian Religious Studies", isNewProgramme: true },
  ],
  ownershipMoves: [
    { prefix: "COS", departmentCode: "SOCO-COS", schoolCode: "SOCO" },
    { prefix: "BU-COS", departmentCode: "SOCO-COS", schoolCode: "SOCO" },
  ],
};

const platform: PlatformSnapshot = {
  schools: [
    { id: "s-seh", code: "SEH", name: "School of Education and Humanities" },
    { id: "s-soc", code: "SOC", name: "School of Computing" },
    { id: "s-sahs", code: "SAHS", name: "School of Allied Health Sciences" },
  ],
  departments: [
    { id: "d-edu", code: "SEH-EDU", name: "Department of Education", schoolId: "s-seh" },
    { id: "d-rel", code: "SEH-REL", name: "Department of Religion", schoolId: "s-seh" },
    { id: "d-cos", code: "SOC-COS", name: "Department of Computer Science", schoolId: "s-soc" },
    { id: "d-ift", code: "SOC-IFT", name: "Department of Information Technology", schoolId: "s-soc" },
    { id: "d-hnd", code: "SAHS-HND", name: "Department of Human Nutrition and Dietetics", schoolId: "s-sahs" },
  ],
  programmes: [
    { id: "p-gnc", code: "SEH-EDU-GNC", name: "Guidance and Counseling", degreeType: "BA.Ed", duration: 4, departmentId: "d-edu", isHidden: false, isNew: false },
    { id: "p-ifs", code: "SOC-IFT-IFS", name: "Information Systems", degreeType: "BSc", duration: 4, departmentId: "d-ift", isHidden: false, isNew: false },
    { id: "p-cys", code: "SOC-COS-CYS", name: "Cyber Security", degreeType: "BSc", duration: 4, departmentId: "d-cos", isHidden: false, isNew: false },
    { id: "p-hnd", code: "SAHS-HND-HND", name: "Human Nutrition and Dietetics", degreeType: "BSc", duration: 4, departmentId: "d-hnd", isHidden: false, isNew: false },
  ],
  courses: [
    { id: "c1", code: "COS 101", ownerDeptId: "d-ift", ownerSchoolId: null },
    { id: "c2", code: "BU-COS 201", ownerDeptId: "d-ift", ownerSchoolId: null },
    { id: "c3", code: "COS 202", ownerDeptId: "d-cos", ownerSchoolId: null }, // already right
    { id: "c4", code: "COSC 101", ownerDeptId: "d-ift", ownerSchoolId: null }, // not a COS course
  ],
};

describe("official names (section 1.1)", () => {
  it("splits and rebuilds '[Degree] (Hons.) [Discipline]', with no (Hons.) for MBBS and BDS", () => {
    expect(splitOfficialName("B.Sc. (Hons.) Human Nutrition and Dietetics")).toEqual({
      degree: "B.Sc.",
      discipline: "Human Nutrition and Dietetics",
    });
    expect(splitOfficialName("BDS Dental Surgery")).toEqual({ degree: "BDS", discipline: "Dental Surgery" });
    expect(officialProgrammeName({ degreeType: "B.Sc.Ed.", name: "Health Education" })).toBe(
      "B.Sc.Ed. (Hons.) Health Education",
    );
    expect(officialProgrammeName({ degreeType: "MBBS", name: "Medicine and Surgery" })).toBe("MBBS Medicine and Surgery");
  });
});

describe("planning the code standard (A5, B15, B18)", () => {
  const plan = planCodeStandard(standard, platform);
  const programme = (code: string) => plan.programmes.find((change) => change.after.code === code)!;

  it("changes codes and names but keeps every record's id", () => {
    expect(plan.schools.find((s) => s.id === "s-seh")).toMatchObject({
      action: "update",
      after: { code: "JSEH", name: "Joel Awoniyi School of Education and Humanities" },
    });
    expect(plan.schools.find((s) => s.id === "s-sahs")?.action).toBe("unchanged");
    expect(plan.schools.some((s) => s.after.code === "SBCS")).toBe(false); // held in reserve
    expect(plan.departments.find((d) => d.id === "d-hnd")?.after.code).toBe("SAHS-NUT");
    expect(programme("JSEH-EDU-GNC")).toMatchObject({
      id: "p-gnc",
      after: { name: "Guidance and Counselling", degreeType: "B.Sc.Ed." },
    });
  });

  it("moves Information Systems to Computer Science and Cybersecurity to Information Technology", () => {
    expect(programme("SOCO-COS-IFS").after.departmentCode).toBe("SOCO-COS");
    expect(programme("SOCO-IFT-CYS").after).toMatchObject({ departmentCode: "SOCO-IFT", name: "Cybersecurity" });
  });

  it("keeps the platform's name for a department whose standard name is still to confirm", () => {
    expect(plan.departments.find((d) => d.id === "d-rel")?.after.name).toBe("Department of Religion");
    expect(plan.problems.join(" ")).toMatch(/JSEH-REL.*to confirm/);
  });

  it("adds new programmes labelled new, hidden ones unlabelled, and applies B15 lengths", () => {
    expect(programme("SOCO-COS-AIN")).toMatchObject({ action: "create", after: { isNew: true, isHidden: false, duration: 4 } });
    expect(programme("JSEH-REL-CRS")).toMatchObject({ action: "create", after: { isNew: false, isHidden: true } });
    expect(programme("SAHS-NUT-NUT").after.duration).toBe(5);
  });

  it("keeps an alias for every changed code", () => {
    expect(plan.aliases).toEqual(
      expect.arrayContaining([
        { kind: "SCHOOL", oldCode: "SEH", newCode: "JSEH", entityId: "s-seh" },
        { kind: "DEPARTMENT", oldCode: "SAHS-HND", newCode: "SAHS-NUT", entityId: "d-hnd" },
        { kind: "PROGRAMME", oldCode: "SOC-IFT-IFS", newCode: "SOCO-COS-IFS", entityId: "p-ifs" },
      ]),
    );
    expect(plan.aliases.some((alias) => alias.oldCode === "SAHS")).toBe(false);
  });

  it("moves courses by their exact prefix only", () => {
    const moved = plan.courseMoves.flatMap((move) => move.courseCodes);
    expect(moved.sort()).toEqual(["BU-COS 201", "COS 101"]);
  });

  it("finds nothing to do once the platform follows the standard", () => {
    const after: PlatformSnapshot = {
      schools: plan.schools.map((s) => ({ id: s.id!, code: s.after.code, name: s.after.name })),
      departments: plan.departments.map((d) => ({
        id: d.id ?? `new-${d.after.code}`,
        code: d.after.code,
        name: d.after.name,
        schoolId: plan.schools.find((s) => s.after.code === d.after.schoolCode)!.id!,
      })),
      programmes: [],
      courses: [],
    };
    after.programmes = plan.programmes.map((p) => ({
      id: p.id ?? `new-${p.after.code}`,
      ...p.after,
      departmentId: after.departments.find((d) => d.code === p.after.departmentCode)!.id,
    }));
    expect(planHasChanges(planCodeStandard(standard, after))).toBe(false);
  });
});

describe("old codes in uploads (A5)", () => {
  const aliases = [
    { kind: "DEPARTMENT", oldCode: "SEH-EDU", newCode: "JSEH-EDU", entityId: "d-edu", validUntil: new Date("2027-02-04T23:59:59+01:00") },
  ];
  const lookup = buildCodeLookup("DEPARTMENT", [{ id: "d-edu", code: "JSEH-EDU" }], aliases, new Date("2026-11-30T12:00:00Z"));

  it("accepts the new code silently and the old one with a warning naming the new code", () => {
    expect(lookup.resolve("JSEH-EDU")).toEqual({ id: "d-edu" });
    expect(lookup.resolve(" seh-edu ")).toEqual({
      id: "d-edu",
      warning: "SEH-EDU is the old department code; it is now JSEH-EDU. Use JSEH-EDU in future uploads.",
    });
    expect(lookup.resolve("XYZ-EDU")).toBeUndefined();
  });

  it("stops accepting the old code after February 4, 2027", () => {
    const later = buildCodeLookup("DEPARTMENT", [{ id: "d-edu", code: "JSEH-EDU" }], aliases, new Date("2027-02-05T00:00:00+01:00"));
    expect(later.resolve("SEH-EDU")).toBeUndefined();
  });
});
